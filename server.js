const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Hand } = require("pokersolver");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 25000, pingTimeout: 20000 });
app.use(express.static("public"));

const PORT = process.env.PORT || 10000;
const START = 500, SB = 2, BB = 5;
const HUMAN_NAMES = ["Raymond", "Emma"];
const BOT_NAMES = ["Tony (TAG)", "Sarah (LAG)", "Mike (Nit)", "Jason (Maniac)", "Chris (Calling)", "David (Reg)"];
const rooms = new Map();

function deck() {
  const suits=["s","h","d","c"], ranks=["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const d=[]; for(const r of ranks) for(const s of suits) d.push(r+s);
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]];}
  return d;
}
function makeRoom(code){
  const players=[...HUMAN_NAMES,...BOT_NAMES].map((name,i)=>({
    seat:i,name,bot:i>=2,stack:START,hole:[],folded:false,allin:false,
    streetBet:0,totalBet:0,acted:false,socketId:null
  }));
  return {code,players,button:7,deck:[],board:[],pot:0,street:"waiting",current:null,
    currentBet:0,minRaise:BB,handNo:0,log:["Waiting for Raymond and Emma to join."],timer:null};
}
function active(r){return r.players.filter(p=>!p.folded && (p.stack>0 || p.totalBet>0));}
function canAct(p){return !p.folded && !p.allin && p.stack>0;}
function nextSeat(r,from,pred=()=>true){
  for(let k=1;k<=8;k++){const i=(from+k)%8;if(pred(r.players[i]))return i;} return null;
}
function post(r,i,amt){
  const p=r.players[i], x=Math.min(amt,p.stack); p.stack-=x;p.streetBet+=x;p.totalBet+=x;
  if(p.stack===0)p.allin=true;
}
function addLog(r,s){r.log.push(s); if(r.log.length>30)r.log.shift();}
function startHand(r){
  clearTimeout(r.timer);
  for(const p of r.players){ if(p.stack<=0)p.stack=START; Object.assign(p,{hole:[],folded:false,allin:false,streetBet:0,totalBet:0,acted:false});}
  r.handNo++; r.button=nextSeat(r,r.button,p=>p.stack>0); r.deck=deck();r.board=[];r.pot=0;r.street="preflop";r.currentBet=BB;r.minRaise=BB;
  for(let n=0;n<2;n++) for(let k=1;k<=8;k++){const i=(r.button+k)%8;r.players[i].hole.push(r.deck.pop());}
  const sb=nextSeat(r,r.button,p=>p.stack>0), bb=nextSeat(r,sb,p=>p.stack>0);
  post(r,sb,SB);post(r,bb,BB);
  for(const p of r.players)p.acted=false;
  r.current=nextSeat(r,bb,p=>canAct(p));
  addLog(r,`Hand #${r.handNo} — button: ${r.players[r.button].name}.`);
  addLog(r,`${r.players[sb].name} posts $${SB}; ${r.players[bb].name} posts $${BB}.`);
  emit(r); maybeBot(r);
}
function bettingDone(r){
  const live=r.players.filter(canAct);
  if(live.length===0)return true;
  return live.every(p=>p.acted && p.streetBet===r.currentBet);
}
function collect(r){for(const p of r.players){r.pot+=p.streetBet;p.streetBet=0;p.acted=false;}r.currentBet=0;r.minRaise=BB;}
function advance(r){
  if(active(r).filter(p=>!p.folded).length===1){collect(r);return showdown(r);}
  collect(r);
  const able=r.players.filter(canAct);
  if(able.length<=1){
    while(r.board.length<5)r.board.push(r.deck.pop());
    return showdown(r);
  }
  if(r.street==="preflop"){r.street="flop";r.board.push(r.deck.pop(),r.deck.pop(),r.deck.pop());}
  else if(r.street==="flop"){r.street="turn";r.board.push(r.deck.pop());}
  else if(r.street==="turn"){r.street="river";r.board.push(r.deck.pop());}
  else return showdown(r);
  addLog(r,`${r.street.toUpperCase()}: ${r.board.join(" ")}`);
  r.current=nextSeat(r,r.button,p=>canAct(p)); emit(r);maybeBot(r);
}
function afterAction(r,seat){
  if(active(r).filter(p=>!p.folded).length===1 || bettingDone(r)) return advance(r);
  r.current=nextSeat(r,seat,p=>canAct(p));emit(r);maybeBot(r);
}
function act(r,seat,type,amount){
  if(r.street==="waiting"||r.street==="showdown"||r.current!==seat)return;
  const p=r.players[seat]; if(!canAct(p))return;
  const call=Math.max(0,r.currentBet-p.streetBet);
  if(type==="fold"){p.folded=true;p.acted=true;addLog(r,`${p.name} folds.`);}
  else if(type==="check"&&call===0){p.acted=true;addLog(r,`${p.name} checks.`);}
  else if(type==="call"&&call>0){const x=Math.min(call,p.stack);post(r,seat,x);p.acted=true;addLog(r,`${p.name} calls $${x}.`);}
  else if(type==="raise"){
    let target=Math.floor(Number(amount));
    const maxTarget=p.streetBet+p.stack;
    const minTarget=r.currentBet+r.minRaise;
    if(maxTarget<=r.currentBet){const x=Math.min(call,p.stack);post(r,seat,x);p.acted=true;addLog(r,`${p.name} calls all-in $${x}.`);}
    else{
      target=Math.max(minTarget,Math.min(target,maxTarget));
      const old=r.currentBet, put=target-p.streetBet;post(r,seat,put);
      r.currentBet=p.streetBet;r.minRaise=Math.max(BB,r.currentBet-old);
      for(const q of r.players)if(canAct(q))q.acted=false;
      p.acted=true;addLog(r,`${p.name} raises to $${r.currentBet}${p.allin?" all-in":""}.`);
    }
  } else return;
  afterAction(r,seat);
}
function showdown(r){
  collect(r);r.street="showdown";r.current=null;
  const contenders=r.players.filter(p=>!p.folded);
  if(contenders.length===1){contenders[0].stack+=r.pot;addLog(r,`${contenders[0].name} wins $${r.pot}.`);r.pot=0;}
  else{
    // MVP: supports all-ins by distributing each side-pot independently.
    const levels=[...new Set(r.players.map(p=>p.totalBet).filter(x=>x>0))].sort((a,b)=>a-b);
    let prev=0;
    for(const level of levels){
      const involved=r.players.filter(p=>p.totalBet>=level);
      const size=(level-prev)*involved.length; prev=level;
      const eligible=involved.filter(p=>!p.folded);
      if(!eligible.length)continue;
      const solved=eligible.map(p=>({p,h:Hand.solve([...p.hole,...r.board])}));
      const wins=Hand.winners(solved.map(x=>x.h));
      const winners=solved.filter(x=>wins.includes(x.h)).map(x=>x.p);
      const share=Math.floor(size/winners.length), rem=size-share*winners.length;
      winners.forEach((p,i)=>p.stack+=share+(i<rem?1:0));
      addLog(r,`${winners.map(p=>p.name).join(" / ")} win${winners.length>1?" split":""} $${size}.`);
    }
    r.pot=0;
    for(const p of contenders)addLog(r,`${p.name}: ${p.hole.join(" ")}`);
  }
  emit(r);
  r.timer=setTimeout(()=>{ if(r.players[0].socketId&&r.players[1].socketId)startHand(r);},5000);
}
function botDecision(r,seat){
  const p=r.players[seat], call=Math.max(0,r.currentBet-p.streetBet);
  // Lightweight personality-aware heuristic, intentionally imperfect.
  const rank=v=>("23456789TJQKA".indexOf(v)+2);
  const a=rank(p.hole[0][0]),b=rank(p.hole[1][0]),pair=a===b,suited=p.hole[0][1]===p.hole[1][1];
  let strength=(Math.max(a,b)+Math.min(a,b))/28 + (pair?.35:0)+(suited?.06:0);
  if(r.board.length){
    try{const h=Hand.solve([...p.hole,...r.board]); strength=Math.min(1,.25+h.rank/9*.75);}catch{}
  }
  let loose=.0, aggr=.0;
  if(p.name.includes("LAG")){loose=.16;aggr=.15}
  if(p.name.includes("Nit")){loose=-.13;aggr=-.03}
  if(p.name.includes("Maniac")){loose=.25;aggr=.32}
  if(p.name.includes("Calling")){loose=.20;aggr=-.12}
  if(p.name.includes("Reg")){loose=.03;aggr=.06}
  const x=Math.random(), s=strength+loose;
  if(call>0 && s<.43 && x>.18)return ["fold"];
  if(s+aggr>.72 && p.stack>call+BB){
    const target=Math.min(p.streetBet+p.stack,Math.max(r.currentBet+r.minRaise,r.currentBet+Math.max(BB,Math.floor((r.pot+call)*(.45+Math.random()*.55)))));
    return ["raise",target];
  }
  if(call>0)return ["call"];
  if(s+aggr>.62 && x>.45){
    const target=Math.min(p.streetBet+p.stack,Math.max(BB,Math.floor(Math.max(BB,r.pot*.55))));
    return ["raise",target];
  }
  return ["check"];
}
function maybeBot(r){
  clearTimeout(r.timer);
  if(r.current==null)return;
  const p=r.players[r.current]; if(!p.bot)return;
  r.timer=setTimeout(()=>{const [t,a]=botDecision(r,r.current);act(r,r.current,t,a);},500+Math.random()*800);
}
function view(r,seat){
  const reveal=r.street==="showdown";
  return {
    code:r.code,handNo:r.handNo,street:r.street,board:r.board,pot:r.pot,current:r.current,
    currentBet:r.currentBet,button:r.button,log:r.log.slice(-10),you:seat,
    players:r.players.map((p,i)=>({seat:i,name:p.name,stack:p.stack,streetBet:p.streetBet,folded:p.folded,allin:p.allin,
      hole:(i===seat||reveal&&!p.folded)?p.hole:[]}))
  };
}
function emit(r){
  for(let i=0;i<2;i++){const sid=r.players[i].socketId;if(sid)io.to(sid).emit("state",view(r,i));}
}
io.on("connection",socket=>{
  socket.on("join",({code,name})=>{
    code=String(code||"EMMA01").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12);
    const seat=name==="Emma"?1:0;
    let r=rooms.get(code);if(!r){r=makeRoom(code);rooms.set(code,r);}
    r.players[seat].socketId=socket.id;socket.data={code,seat};
    socket.emit("joined",{seat,code});emit(r);
    if(r.players[0].socketId&&r.players[1].socketId&&r.street==="waiting")startHand(r);
  });
  socket.on("action",({type,amount})=>{const d=socket.data;if(!d)return;const r=rooms.get(d.code);if(r)act(r,d.seat,type,amount);});
  socket.on("disconnect",()=>{const d=socket.data;if(!d)return;const r=rooms.get(d.code);if(r&&r.players[d.seat].socketId===socket.id)r.players[d.seat].socketId=null;});
});
server.listen(PORT,"0.0.0.0",()=>console.log(`Poker server on ${PORT}`));
