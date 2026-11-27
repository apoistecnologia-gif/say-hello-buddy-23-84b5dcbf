import {useEffect,useState} from "react";
import type {ActiveRide} from "@/types/rides/active-ride";
import {isHmlDispatch,readHmlPassengerPin} from "@/lib/hml-dispatch-client";
type Pin={key:string;value:string;until:number};
export function useHmlPassengerPin(ride:ActiveRide|null,checked:Date|null):string|undefined{
 const [pin,setPin]=useState<Pin|null>(null);
 const rideId=ride?.id,driverId=ride?.driver_id,generation=ride?.assignment_generation;
 const permitted=isHmlDispatch&&!!rideId&&!!driverId&&!!generation&&!!checked&&["motorista_a_caminho","motorista_chegou"].includes(ride?.status??"");
 const key=permitted?[rideId,driverId,generation].join(":"):"";
 const verifiedAt=checked?.getTime()??0;
 useEffect(()=>{
  setPin(null);
  if(!key||!rideId||!driverId||!generation||Date.now()-verifiedAt>8000)return;
  let ctrl:AbortController|undefined,timer:number|undefined,live=true;
  const clear=()=>{ctrl?.abort();if(timer!==undefined)window.clearTimeout(timer);setPin(null);};
  const refresh=()=>{
   clear();
   if(document.visibilityState!=="visible"||!navigator.onLine||Date.now()-verifiedAt>8000)return;
   ctrl=new AbortController();const current=ctrl;
   void readHmlPassengerPin(rideId,driverId,generation,current.signal).then(value=>{
    if(!live||current.signal.aborted||document.visibilityState!=="visible"||!navigator.onLine)return;
    const until=verifiedAt+8000;
    if(Date.now()>=until)return;
    setPin({key,value,until});timer=window.setTimeout(()=>setPin(null),until-Date.now());
   }).catch(()=>{if(live&&!current.signal.aborted)setPin(null);});
  };
  const hide=()=>{if(document.visibilityState==="visible")refresh();else clear();};
  refresh();
  document.addEventListener("visibilitychange",hide);window.addEventListener("offline",clear);
  return()=>{live=false;ctrl?.abort();if(timer!==undefined)window.clearTimeout(timer);document.removeEventListener("visibilitychange",hide);window.removeEventListener("offline",clear);};
 },[key,rideId,driverId,generation,verifiedAt]);
 return key&&pin?.key===key&&Date.now()<pin.until?pin.value:undefined;
}
