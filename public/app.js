const socket=io();let state=null;
const sym=c=>c?c[0]+({s:"♠",h:"♥",d:"♦",c:"♣"}[c[1]]||""):"";
function join(name){localStorage.pokerName=name;localStorage.pokerCode=document.getElementById("code").value.toUpperCase();socket.emit("join",{name,code:localStorage.pokerCode});}
socket.on("connect",()=>{if(localStorage.pokerName&&localStorage.pokerCode)socket.emit("join",{name:localStorage.pokerName,code:localStorage.pokerCode});});
socket.on("joined",()=>{document.getElementById("join").classList.add("hidden");document.getElementById("game").classList.remove("hidden");});
socket.on("state",s=>{state=s;render();});
function render(){
 document.getElementById("room").textContent="Room "+state.code;document.getElementById("hand").textContent="Hand #"+state.handNo;
 document.getElementById("board").textContent=state.board.map(sym).join("  ")||"· · · · ·";
 document.getElementById("pot").textContent="Pot $"+state.pot+"  |  To $"+state.currentBet;
 document.getElementById("street").textContent=state.street.toUpperCase();
 const ps=document.getElementById("players");ps.innerHTML="";
 state.players.forEach(p=>{let d=document.createElement("div");d.className=`player p${p.seat} ${p.folded?"folded":""} ${state.current===p.seat?"turn":""}`;
  const cards=p.hole.length?p.hole.map(sym).join(" "):(p.folded?"—":"🂠 🂠");
  d.innerHTML=`<b>${p.name}${state.button===p.seat?" Ⓓ":""}</b><div>$${p.stack}${p.streetBet?` · bet $${p.streetBet}`:""}</div><div class="hole">${cards}</div>`;
  ps.appendChild(d);
 });
 const me=state.players[state.you], turn=state.current===state.you, call=Math.max(0,state.currentBet-me.streetBet);
 document.getElementById("status").textContent=turn?`Your turn${call?` · $${call} to call`:" · you can check"}`:(state.street==="showdown"?"Showdown — next hand in 5 seconds":"Waiting…");
 const a=document.getElementById("actions");a.innerHTML="";
 if(turn){
   addBtn("Fold",()=>send("fold")); if(call===0)addBtn("Check",()=>send("check"));else addBtn(`Call $${Math.min(call,me.stack)}`,()=>send("call"));
   const wrap=document.createElement("div");wrap.className="raise";const inp=document.createElement("input");inp.type="number";inp.id="raiseAmt";inp.value=Math.max(state.currentBet+5,10);
   const b=document.createElement("button");b.textContent="Raise to";b.onclick=()=>send("raise",Number(inp.value));wrap.append(b,inp);a.appendChild(wrap);
 }
 document.getElementById("log").innerHTML=state.log.slice().reverse().map(x=>`<div>${x}</div>`).join("");
}
function addBtn(t,f){const b=document.createElement("button");b.textContent=t;b.onclick=f;document.getElementById("actions").appendChild(b)}
function send(type,amount){socket.emit("action",{type,amount})}