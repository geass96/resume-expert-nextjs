import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync,rmSync,cpSync,mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes,scryptSync } from "node:crypto";
import { once } from "node:events";
import net from "node:net";

const temp=mkdtempSync(join(tmpdir(),"resume-integration-"));
const socket=net.createServer();socket.listen(0,"127.0.0.1");await once(socket,"listening");
const port=socket.address().port;await new Promise(ok=>socket.close(ok));
const root=process.cwd(),app=join(root,".next","standalone");
mkdirSync(join(app,".next"),{recursive:true});
cpSync(join(root,".next","static"),join(app,".next","static"),{recursive:true,force:true});
const password=randomBytes(24).toString("hex"),salt=randomBytes(16).toString("hex");
const origin="http://127.0.0.1:"+port;
const env={...process.env,NODE_ENV:"production",HOSTNAME:"127.0.0.1",PORT:String(port),
 RESUME_PUBLIC_ORIGIN:origin,RESUME_DATA_DIR:temp,
 RESUME_PASSWORD_SALT:salt,RESUME_PASSWORD_HASH:scryptSync(password,salt,32).toString("hex"),
 RESUME_SESSION_SECRET:randomBytes(40).toString("hex"),USE_MOCK_AI:"true",RESUME_TRUST_CLOUDFLARE_IP:"false"};
const appProcess=spawn(process.execPath,["server.js"],{cwd:app,env,stdio:["ignore","pipe","pipe"]});
let output="";
for(const stream of [appProcess.stdout,appProcess.stderr])stream.on("data",x=>output=(output+x).slice(-4000));
try{
 let ready=false;
 for(let i=0;i<100;i++){try{const r=await fetch(origin+"/login");if(r.ok){ready=true;break;}}catch{}await new Promise(ok=>setTimeout(ok,180));}
 assert(ready,"Application did not start: "+output);
 assert.equal((await fetch(origin+"/",{redirect:"manual"})).status,307,"Anonymous frontend redirect");
 assert.equal((await fetch(origin+"/api/history")).status,401,"Anonymous history must be private");
 assert.equal((await fetch(origin+"/api/ai/usage")).status,401,"Anonymous AI usage must be private");
 assert.equal((await fetch(origin+"/api/analyze",{method:"POST",headers:{Origin:origin}})).status,401,"Anonymous cannot consume LLM");
 const login=await fetch(origin+"/api/auth/login",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({password})});
 assert.equal(login.status,200,"Login must succeed");
 const loginProbeHeaders={Origin:origin,"Content-Type":"application/json","CF-Connecting-IP":"192.0.2.55"};
 for(let i=0;i<4;i++){
   const response=await fetch(origin+"/api/auth/login",{method:"POST",
     headers:{...loginProbeHeaders,"CF-Connecting-IP":"192.0.2."+String(i+1),"X-Forwarded-For":"198.51.100."+String(i+1)},
     body:JSON.stringify({password:"synthetic-wrong-password"})});
   assert.equal(response.status,401,"Wrong passwords count toward the default owner bucket regardless of IP headers");
 }
 const blockedLogin=await fetch(origin+"/api/auth/login",{method:"POST",
   headers:{...loginProbeHeaders,"X-Forwarded-For":"203.0.113.200"},
   body:JSON.stringify({password:"synthetic-wrong-password"})});
 assert.equal(blockedLogin.status,429,"Sixth attempt must be limited even with changing Cloudflare and forwarding headers");
 const cookie=login.headers.get("set-cookie").split(";")[0];
 const headers={Cookie:cookie,Origin:origin,"Content-Type":"application/json"};
 const oversizedJson=JSON.stringify({input:{targetRole:"synthetic role",jobDescription:"x",originalResume:"x"},padding:"x".repeat(121000)});
 const oversizedStream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(oversizedJson));controller.close();}});
 const oversizedResponse=await fetch(origin+"/api/analyze",{method:"POST",headers,body:oversizedStream,duplex:"half"});
 assert.equal(oversizedResponse.status,413,"Streaming request body without Content-Length must still be capped");
 const privateMarker="FAKE_PII_SYNTHETIC_ONLY";
 const malformedResponse=await fetch(origin+"/api/analyze",{method:"POST",headers,body:privateMarker});
 assert.equal(malformedResponse.status,400,"Malformed JSON must be rejected as a client error");
 assert(!JSON.stringify(await malformedResponse.json()).includes(privateMarker),"Parser errors must not expose request snippets");
 const nullResponse=await fetch(origin+"/api/analyze",{method:"POST",headers,body:"null"});
 assert.equal(nullResponse.status,400,"JSON null must be rejected before reading request properties");
 assert.equal((await fetch(origin+"/",{headers})).status,200);
 assert.equal((await fetch(origin+"/api/history",{headers})).status,200);
 assert(!output.includes(privateMarker),"Malformed private input must not be copied into application logs");
 const usage=await fetch(origin+"/api/ai/usage?days=30&page=1",{headers});
 assert.equal(usage.status,200,"Authenticated owner can read AI usage");
 const usageData=await usage.json();
 assert.equal(usageData.summary.total,0,"Fresh isolated install starts with no AI usage");
 assert(Array.isArray(usageData.rows)&&Array.isArray(usageData.byPurpose));
 assert(!JSON.stringify(usageData).includes(password));
 assert.equal((await fetch(origin+"/api/ai/usage?days=not-a-number",{headers})).status,400);
 assert.equal((await fetch(origin+"/api/ai/usage?purpose=private",{headers})).status,400);
 console.log("PASS isolated HTTP: AI usage is private, filtered, secret-free and starts empty");

 assert.equal((await fetch(origin+"/api/history",{method:"POST",headers:{...headers,Origin:"https://evil.invalid"},body:"{}"})).status,403);
 const snapshot={personalInfo:{name:"测试",phone:"",email:"",location:""},jobIntent:"AI",summary:"测试",
  coreSkills:[],workExperience:[],projectExperience:[],skillsAndTools:[],education:{school:"",degree:"",period:""}};
 const post=async data=>fetch(origin+"/api/history",{method:"POST",headers,body:JSON.stringify(data)});
 const payload={profileTitle:"主简历",company:"",role:"产品经理",jdText:"测试JD",label:"原始",note:"集成测试",snapshot,decisions:{}};
 const first=await post(payload);assert.equal(first.status,201,await first.clone().text());const a=await first.json();
 const updated={...snapshot,summary:"更新后的内容"};
 const second=await post({...payload,profileId:a.profileId,jobId:a.jobId,parentVersionId:a.id,snapshot:updated});
 assert.equal(second.status,201,await second.clone().text());const b=await second.json();
 const compare=await fetch(origin+"/api/history/compare?a="+a.id+"&b="+b.id,{headers});assert.equal(compare.status,200);
 const compared=await compare.json();assert.equal(compared.a.snapshot.summary,"测试");assert.equal(compared.b.snapshot.summary,"更新后的内容");
 const legacy=await fetch(origin+"/api/history/"+a.id,{headers}).then(r=>r.json());
 assert.equal(legacy.workflow,null);assert.equal(legacy.jobDescription,"测试JD");
 const userInput={targetRole:"产品经理",industry:"软件",companyType:"中型公司",jobStage:"转行",highlightSkills:"需求分析",jobDescription:"测试JD",originalResume:"测试简历材料",additionalInfo:""};
 const analyzed=await fetch(origin+"/api/analyze",{method:"POST",headers,body:JSON.stringify({input:userInput,optimizeStyle:"concise"})});
 assert.equal(analyzed.status,200,await analyzed.clone().text());
 const result=(await analyzed.json()).result;
 result.followUpQuestions[0].userAnswer="集成测试的人工回答";
 const workflow={userInput,analysisResult:result,optimizeStyle:"concise"};
 const full=await post({...payload,profileId:a.profileId,jobId:a.jobId,parentVersionId:b.id,workflow});
 assert.equal(full.status,201,await full.clone().text());
 const fullId=(await full.json()).id;
 const roundtrip=await fetch(origin+"/api/history/"+fullId,{headers}).then(r=>r.json());
 assert.deepEqual(roundtrip.workflow,workflow,"History API retains all analysis and editable follow-up answers");
 const invalid=await post({...payload,workflow:{...workflow,analysisResult:{}}});
 assert.equal(invalid.status,400,"Malformed workflow rejected without saving a version");
 console.log("PASS isolated HTTP: legacy history compatible; full workflow, answers and inputs round-trip through save/restore API");
 const changedJob=await post({...payload,profileId:a.profileId,jobId:a.jobId,parentVersionId:b.id,
   company:"合成B公司",role:"合成B岗位",jdText:"合成B JD"});
 assert.equal(changedJob.status,201);
 const changedTarget=await changedJob.json();
 assert.notEqual(changedTarget.jobId,a.jobId,"Changed JD must create a new target");
 assert.equal(changedTarget.versionNo,1);
 const changedVersion=await fetch(origin+"/api/history/"+changedTarget.id,{headers}).then(r=>r.json());
 assert.equal(changedVersion.jobDescription,"合成B JD");
 assert.equal(changedVersion.parentVersionId,null);
 const changedPractice=await fetch(origin+"/api/interview/sessions",{method:"POST",headers,
   body:JSON.stringify({versionId:changedTarget.id,kind:"project"})});
 assert.equal(changedPractice.status,201);
 const changedSession=(await changedPractice.json()).session;
 assert.equal(changedSession.role,"合成B岗位");
 assert.equal(changedSession.company,"合成B公司");
 assert.equal((await fetch(origin+"/api/interview/sessions/"+changedSession.id,{method:"DELETE",headers})).status,200);
 console.log("PASS isolated HTTP: changed job forks V1, preserves old versions and supplies the new interview context");
 const introduction=await fetch(origin+"/api/introduction",{method:"POST",headers,body:JSON.stringify({versionId:b.id,duration:1})});
 assert.equal(introduction.status,200);const introData=await introduction.json();assert.equal(introData.mode,"mock");
 assert.equal((await fetch(origin+"/api/interview/sessions")).status,401);
 assert.equal((await fetch(origin+"/api/interview/sessions",{method:"POST",headers:{...headers,Origin:"https://invalid.example"},body:JSON.stringify({versionId:a.id,kind:"project"})})).status,403);
 const practice=await fetch(origin+"/api/interview/sessions",{method:"POST",headers,body:JSON.stringify({versionId:a.id,kind:"project"})});
 assert.equal(practice.status,201,await practice.clone().text());
 let session=(await practice.json()).session;
 assert.equal(session.versionId,a.id);
 assert.equal(session.status,"active");
 assert.equal(session.source,"mock");
 assert.match(session.question,/product|project|项目|经历/i);
 const stateUrl=origin+"/api/interview/sessions/"+session.id+"/state";
 const answerUrl=origin+"/api/interview/sessions/"+session.id+"/answer";
 const state=async action=>fetch(stateUrl,{method:"POST",headers,body:JSON.stringify({action})});
 assert.equal((await state("pause")).status,200);
 assert.equal((await fetch(answerUrl,{method:"POST",headers,body:JSON.stringify({round:1,answer:"I designed the pilot and tested the outcomes"})})).status,409);
 assert.equal((await state("resume")).status,200);
 for(let round=1;round<=6;round++){
   const answer=await fetch(answerUrl,{method:"POST",headers,
     body:JSON.stringify({round,answer:"Round "+round+" I designed a dashboard for ExampleCo with measurement 20%"})});
   assert.equal(answer.status,200,await answer.clone().text());
   session=(await answer.json()).session;
   assert.equal(session.roundCount,round);
   assert.equal(session.turns.length,round);
   assert.equal(session.turns[round-1].feedback.source,"mock");
 }
 assert.equal(session.status,"completed");
 const repeated=await fetch(answerUrl,{method:"POST",headers,body:JSON.stringify({round:6,answer:"duplicate"})});
 assert.equal(repeated.status,409);
 const replay=await fetch(origin+"/api/interview/sessions/"+session.id,{headers});
 assert.equal((await replay.json()).session.turns.length,6);
 const list=await fetch(origin+"/api/interview/sessions",{headers});
 assert.equal((await list.json()).sessions[0].versionId,a.id);
 const remove=await fetch(origin+"/api/interview/sessions/"+session.id,{method:"DELETE",headers});
 assert.equal(remove.status,200);
 assert.equal((await fetch(origin+"/api/interview/sessions/"+session.id,{headers})).status,404);
 assert.equal((await fetch(origin+"/api/interview/sessions",{headers}).then(r=>r.json())).sessions.some(x=>x.id===session.id),false);
 assert.equal((await fetch(origin+"/api/chatgpt-subscription")).status,401,"Subscription status is private");
 assert.equal((await fetch(origin+"/api/chatgpt-subscription",{method:"POST",headers:{...headers,Origin:"https://evil.invalid"},body:JSON.stringify({action:"activate",model:"gpt-6.1-sol"})})).status,403,"OAuth state changes require same origin");
 const siwc=await fetch(origin+"/api/chatgpt-subscription",{headers});
 assert.equal(siwc.status,200,"Subscription status accessible to logged in owner");
 const info=await siwc.json();
 assert.equal(info.connected,false,"No OAuth credentials installed");
 assert.equal(info.active,false,"No subscription accidentally active");
 assert.match(info.hostId,/^urn:uuid:/,"VM host ID persisted");
 const noCredentials=await fetch(origin+"/api/chatgpt-subscription",{method:"POST",headers,body:JSON.stringify({action:"activate",model:"gpt-6.1-sol"})});
 assert.equal(noCredentials.status,400,"Cannot activate subscription without consent");
 const noModels=await fetch(origin+"/api/chatgpt-subscription",{method:"POST",headers,body:JSON.stringify({action:"models"})});
 assert.equal(noModels.status,409,"Cannot read subscription catalog without consent");
 const noTest=await fetch(origin+"/api/chatgpt-subscription",{method:"POST",headers,body:JSON.stringify({action:"test"})});
 assert.equal(noTest.status,409,"Cannot run a real subscription inference before owner consent and model activation");
 assert.equal((await fetch(origin+"/api/chatgpt-subscription/pair",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status,401,"Pair creation must be private");
 assert.equal((await fetch(origin+"/api/chatgpt-subscription/pair",{method:"POST",headers:{...headers,Origin:"https://malicious.invalid"},body:"{}"})).status,403,"Pair creation must reject cross-origin requests");
 const createdPair=await fetch(origin+"/api/chatgpt-subscription/pair",{method:"POST",headers,body:"{}"});
 assert.equal(createdPair.status,200,"Authorized browser pair starts");
 const browserPair=await createdPair.json();
 assert.match(browserPair.token,/^[A-Za-z0-9_-]{40,60}$/);
 const badCompletion=await fetch(origin+"/api/chatgpt-subscription/pair/complete",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({token:browserPair.token,credential:{issuer:"https://wrong.invalid"}})
 });
 assert.equal(badCompletion.status,400,"Invalid OAuth material rejected");
 const afterPair=await fetch(origin+"/api/chatgpt-subscription",{headers}).then(x=>x.json());
 assert.equal(afterPair.connected,false,"Invalid OAuth import must not connect subscription");
 const qoderOperation={action:"models",id:"synthetic-missing-id"};
 assert.equal((await fetch(origin+"/api/model-settings",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify(qoderOperation)})).status,401,"Qoder catalog is owner-only");
 assert.equal((await fetch(origin+"/api/model-settings",{method:"POST",headers:{...headers,Origin:"https://evil.invalid"},body:JSON.stringify(qoderOperation)})).status,403,"Qoder catalog requires same origin");
 const fakePat="synthetic-qoder-integration-pat-not-real";
 const beforeQoder=await fetch(origin+"/api/model-settings",{headers}).then(r=>r.json());
 const savedQoder=await fetch(origin+"/api/model-settings",{method:"POST",headers,
   body:JSON.stringify({action:"save",provider:"qoder",model:"auto",apiKey:fakePat})});
 assert.equal(savedQoder.status,200,"Qoder PAT can be saved without inference");
 const qoderId=(await savedQoder.json()).id;
 const settings=await fetch(origin+"/api/model-settings",{headers}).then(r=>r.json());
 assert.equal(settings.mode,beforeQoder.mode,"Saving Qoder preserves the current selection");
 assert(settings.providers.qoder,"Qoder appears in the provider selector");
 assert.equal(JSON.stringify(settings).includes(fakePat),false,"Qoder PAT never reaches public settings");
 assert.equal((await fetch(origin+"/api/model-settings",{method:"POST",headers,
   body:JSON.stringify({action:"activate",id:qoderId})})).status,200);
 const qoderStatus=await fetch(origin+"/api/ai/status",{headers}).then(r=>r.json());
 assert.equal(qoderStatus.provider,"qoder","Activated Qoder is routed through AI config");
 assert.equal(qoderStatus.model,"auto");
 assert.equal((await fetch(origin+"/api/model-settings",{method:"DELETE",headers,body:JSON.stringify({id:qoderId})})).status,200);
 assert.equal((await fetch(origin+"/api/ai/status",{headers}).then(r=>r.json())).mode,"mock","Deleting active Qoder returns to Mock");
 assert(!output.includes(fakePat),"Qoder PAT is absent from app logs");
 console.log("PASS isolated HTTP: Qoder PAT save/select/delete, private catalog, CSRF, no credential echoes or paid calls");
 console.log("PASS isolated HTTP: browser OAuth pairing, CSRF, rejection of fabricated credentials");
 console.log("PASS isolated HTTP: SIWC OAuth status, stable host, login and CSRF protections, no unauthorized activation");
 console.log("PASS isolated HTTP: mock interview, JD-backed session, pause/resume, 6 rounds, duplicate protection, replay, private API");
 console.log("PASS isolated HTTP: login, private UI/API, CSRF, version persistence, compare and introduction");
}finally{
 appProcess.kill();await once(appProcess,"exit");
 rmSync(temp,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
