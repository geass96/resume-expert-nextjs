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
 RESUME_SESSION_SECRET:randomBytes(40).toString("hex"),USE_MOCK_AI:"true"};
const appProcess=spawn(process.execPath,["server.js"],{cwd:app,env,stdio:["ignore","pipe","pipe"]});
let output="";
for(const stream of [appProcess.stdout,appProcess.stderr])stream.on("data",x=>output=(output+x).slice(-4000));
try{
 let ready=false;
 for(let i=0;i<100;i++){try{const r=await fetch(origin+"/login");if(r.ok){ready=true;break;}}catch{}await new Promise(ok=>setTimeout(ok,180));}
 assert(ready,"Application did not start: "+output);
 assert.equal((await fetch(origin+"/",{redirect:"manual"})).status,307,"Anonymous frontend redirect");
 assert.equal((await fetch(origin+"/api/history")).status,401,"Anonymous history must be private");
 assert.equal((await fetch(origin+"/api/analyze",{method:"POST",headers:{Origin:origin}})).status,401,"Anonymous cannot consume LLM");
 const login=await fetch(origin+"/api/auth/login",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({password})});
 assert.equal(login.status,200,"Login must succeed");
 const cookie=login.headers.get("set-cookie").split(";")[0];
 const headers={Cookie:cookie,Origin:origin,"Content-Type":"application/json"};
 assert.equal((await fetch(origin+"/",{headers})).status,200);
 assert.equal((await fetch(origin+"/api/history",{headers})).status,200);
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
 const introduction=await fetch(origin+"/api/introduction",{method:"POST",headers,body:JSON.stringify({versionId:b.id,duration:1})});
 assert.equal(introduction.status,200);const introData=await introduction.json();assert.equal(introData.mode,"mock");
 console.log("PASS isolated HTTP: login, private UI/API, CSRF, version persistence, compare and introduction");
}finally{
 appProcess.kill();await once(appProcess,"exit");
 rmSync(temp,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
