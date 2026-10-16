export async function streamJSON(task:()=>Promise<unknown>):Promise<Response> {
  const encoder=new TextEncoder();
  let cancelled=false;
  let heartbeat:ReturnType<typeof setInterval>|undefined;
  const body=new ReadableStream<Uint8Array>({
    start(controller){
      // JSON permits leading whitespace. Flush headers and enough padding to
      // cross proxy buffers while the analysis runs, without inventing a result.
      const pulse=()=>controller.enqueue(encoder.encode(' '.repeat(4096)+'\n'));
      pulse();
      heartbeat=setInterval(pulse,10000);
      void Promise.resolve().then(task).then(
        result=>{if(!cancelled){controller.enqueue(encoder.encode(JSON.stringify(result)));controller.close();}},
        ()=>{if(!cancelled){controller.enqueue(encoder.encode(JSON.stringify({error:'分析失败，请稍后重试'})));controller.close();}}
      ).finally(()=>clearInterval(heartbeat));
    },
    cancel(){cancelled=true;clearInterval(heartbeat);}
  });
  return new Response(body,{headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, no-transform',
    'X-Accel-Buffering':'no'
  }});
}
