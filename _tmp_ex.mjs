import fs from "fs"
const buf=fs.readFileSync("D:/dev/git/cp2077-CombatReborn/archives/cp2077-CombatReborn/source/raw/base/animations/player/female/body/player_locomotion.anims.glb")
const dv=new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
let off=12, json=null
while(off+8<=dv.byteLength){const len=dv.getUint32(off,true); const typ=dv.getUint32(off+4,true); off+=8; if(typ===0x4e4f534a){json=JSON.parse(Buffer.from(buf.subarray(off,off+len)).toString("utf8").replace(/\0+$/,""));} off+=len}
const a0=json.animations[0]
console.log("a0 keys", Object.keys(a0))
console.log("extras type", typeof a0.extras, a0.extras && (typeof a0.extras==="string"? a0.extras.slice(0,300): JSON.stringify(a0.extras).slice(0,500)))
// check anims.json animationType distribution
const j=JSON.parse(fs.readFileSync("D:/dev/git/cp2077-CombatReborn/archives/cp2077-CombatReborn/source/raw/base/animations/player/female/body/player_locomotion.anims.json","utf8"))
const types={}
for(const e of j.Data.RootChunk.animations){
  const ad=e.Data.animation.Data
  const t=ad.animationType||"?"
  types[t]=(types[t]||0)+1
}
console.log("player_locomotion animationTypes", types)
// find which animset has add_camera_recoil
const {execSync}=await import("child_process")
