// Sending confirmations must keep working while catalogue imports or Dropea are slow.
export function createLandingWorker({flow,whatsapp,canDispatch=()=>true,onError=()=>{}}){
  let sending=false,dispatching=false;
  async function send(){
    if(sending)return;
    sending=true;
    try{await flow.sendNext(whatsapp);}catch(error){onError(error);}finally{sending=false;}
  }
  async function dispatch(){
    if(dispatching||!canDispatch())return;
    dispatching=true;
    try{await flow.dispatchNext();}catch(error){onError(error);}finally{dispatching=false;}
  }
  return {send,dispatch,kick(){setImmediate(()=>{void send();void dispatch();});}};
}
