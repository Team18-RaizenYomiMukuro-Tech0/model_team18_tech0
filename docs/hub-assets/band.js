// 上部の霊力ゲージ。hub.html と overview.html で共通。progress-summary.json が読めなければ元の STAGE ボタンのまま
/* 霊力ゲージ: 同じサイトの progress-summary.json から。読めなければ元の STAGE ボタンのまま */
(function(){var old0=document.querySelector(".band .stages");if(!old0||!window.fetch)return;
var gz=document.createElement("div");gz.className="gz";gz.id="gz";gz.hidden=true;
gz.innerHTML='<p class="gzt"><span id="gz-all"></span><span class="gzp" id="gz-pw" hidden></span></p><div class="gb" id="gb" role="img"><div class="gf" id="gf"></div><div class="gc" id="gc"></div></div><div class="gn" id="gn" aria-hidden="true"></div><ol class="gl" id="gl" aria-label="4つのステージ"></ol><ul class="gk"><li><i class="k1"></i>閉じた Issue</li><li id="gk-c" hidden><i class="k2"></i>溜め中（PR は合流済み・Issue は未完了）</li></ul>';
old0.parentNode.insertBefore(gz,old0.nextSibling);
var ST=[["霊気","5文書","W1","〜11/7"],["霊丸","実装①","W2","11/8〜11/11"],["霊光波動","実装②","W3","11/12〜11/15"],["魔族覚醒","評価・受入","W4","11/16〜11/21"]];
function md(x){var m=/^\d{4}-(\d{2})-(\d{2})/.exec(x||"");return m?(+m[1])+"/"+(+m[2]):""}
function mk(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function num(v){return typeof v==="number"&&isFinite(v)&&v>=0}
fetch("progress-summary.json",{cache:"no-cache"}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){
var ph=j&&j.phases;if(!Array.isArray(ph)||ph.length!==4)throw 0;
ph.forEach(function(p){if(!p||!num(p.closed)||!num(p.total))throw 0});
var jst=new Date(Date.now()+9*36e5).toISOString().slice(0,10);
var all=0,ch=0,seg=[];ph.forEach(function(p,i){if(p.total){var cl=p.closed/p.total*25,mo=num(p.merged_open)?Math.min(p.merged_open/p.total*25,25-cl):0;all+=cl;if(mo>0){ch+=mo;seg.push([i*25+cl,mo,i>0&&cl<.5])}}});
all=Math.round(all);ch=Math.round(ch);
var cur=-1;ph.forEach(function(p,i){if(cur<0&&typeof p.start==="string"&&typeof p.due==="string"&&p.start<=jst&&jst<=p.due)cur=i});
if(cur<0)ph.forEach(function(p,i){if(cur<0&&p.total>0&&p.closed<p.total)cur=i});
document.getElementById("gz-all").textContent="全体 "+all+"%";
var t=j.today,pw=document.getElementById("gz-pw");
if(t&&num(t.gain)&&t.gain>0){pw.textContent="今日 +"+t.gain+" 霊力";pw.hidden=false}
var bar=document.getElementById("gb");bar.setAttribute("aria-label","全体の進み具合 "+all+"パーセント"+(ch?"、溜め中 "+ch+"パーセント分":""));
var gn=document.getElementById("gn"),gl=document.getElementById("gl");
ST.forEach(function(s,i){var pos=(i+1)*25,lit=all>=pos,now=i===cur;
var d=mk("span","gd"+(lit?" lit":"")+(now?" now":""));d.style.left=pos===100?"calc(100% - 9px)":pos+"%";if(pos===100)d.classList.add("last");d.style.setProperty("--c",i===3?"#fff":"var(--m"+(i+1)+")");gn.appendChild(d);
var li=mk("li",(now?"now":"")+(lit||now?"":" off"));li.dataset.n=i+1;
li.appendChild(mk("span","no","STAGE "+(i+1)));li.appendChild(mk("span","nm",s[0]));
var w=mk("span","ws");w.appendChild(mk("span","o",s[1]+"（"));w.appendChild(document.createTextNode(s[2]));w.appendChild(mk("span","o","）"));li.appendChild(w);
if(now){var a=md(ph[i].start),b=md(ph[i].due);li.appendChild(mk("span","dt",a&&b?a+"〜"+b:s[3]))}
gl.appendChild(li)});
var f=document.getElementById("gf"),c=document.getElementById("gc");
gz.hidden=false;var old=document.querySelector(".band .stages");if(old)old.hidden=true;
if(ch)document.getElementById("gk-c").hidden=false;
requestAnimationFrame(function(){requestAnimationFrame(function(){f.style.clipPath="inset(0 "+(100-all)+"% 0 0)";seg.forEach(function(x){var e=document.createElement("i");e.style.left=x[2]?"calc("+x[0]+"% + 11px)":x[0]+"%";e.style.width=x[1]+"%";c.appendChild(e)})})});
}).catch(function(){})})();
