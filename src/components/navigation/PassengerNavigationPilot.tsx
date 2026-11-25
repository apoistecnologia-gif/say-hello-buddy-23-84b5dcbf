import { useEffect,useRef,useState } from "react";
import { useNavigate,useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { PILOT_INSTALLED,NEW_SELECTION_ENABLED,preparePilotMap } from "./pilot-config";
import { pilotRuntime } from "./pilot-runtime";
import { mountDurablePassengerHost } from "../../../experimental/apois-navigation/ui/durable-passenger-view.mjs";

export function PassengerNavigationPilot(){
  // This wrapper has no hooks/network/storage effects while not installed.
  return PILOT_INSTALLED ? <InstalledPilot/> : null;
}
function InstalledPilot(){
  const {user}=useAuth();
  return user?.id ? <AccountPilot key={user.id} account={user.id}/> : null;
}
function AccountPilot({account}:{account:string}){
  const navigate=useNavigate();
  const path=useRouterState({select:s=>s.location.pathname});
  const [pending,setPending]=useState<boolean|null>(null);
  const [open,setOpen]=useState(false);
  const [failure,setFailure]=useState(false);
  const mountRef=useRef<HTMLDivElement>(null);
  const mapRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let alive=true,seq=0;
    const refresh=()=>{const id=++seq;void pilotRuntime.pending(account).then(value=>{
      if(alive&&id===seq)setPending(value);
    },()=>{if(alive&&id===seq)setPending(null)});};
    refresh();
    window.addEventListener("pageshow",refresh);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return()=>{alive=false;window.removeEventListener("pageshow",refresh);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh)};
  },[account,open,path]);
  useEffect(()=>{
    if(!open||!mountRef.current||!mapRef.current)return;
    const root=mountRef.current,mapRoot=mapRef.current,controller=new AbortController();
    let dispose:(()=>void)|undefined;
    let releaseMap:(()=>void)|undefined;
    const start=async()=>{
      try{
        const recovering=await pilotRuntime.pending(account);
        if(controller.signal.aborted)return;
        // Recovery is independent of map data and remains available when
        // creation is disabled or the regional pack is unavailable.
        const prepared=!recovering&&NEW_SELECTION_ENABLED?await preparePilotMap(mapRoot,account,controller.signal):null;
        if(controller.signal.aborted){prepared?.dispose();return;}
        releaseMap=prepared?.dispose;
        const mounted=await mountDurablePassengerHost(root,{
          enabled:true,account,auth:supabase.auth,
          invoke:(name:string,options:Parameters<typeof supabase.functions.invoke>[1])=>supabase.functions.invoke(name,options),
          map:prepared?.map,catalog:prepared?.catalog,
          allowSelection:!recovering&&NEW_SELECTION_ENABLED&&prepared!==null,
          signal:controller.signal,onReturn:()=>{if(!controller.signal.aborted)setOpen(false)},
          onTrack:rideId=>{
            if(controller.signal.aborted)return;
            setOpen(false);
            void navigate({to:"/corrida/$rideId",params:{rideId},replace:true});
          },
        });
        if(controller.signal.aborted){mounted?.dispose();return;}
        dispose=mounted?.dispose;
        if(!mounted)setFailure(true);
      }catch{if(!controller.signal.aborted)setFailure(true)}
    };
    void start();
    return()=>{controller.abort();dispose?.();releaseMap?.();};
  },[account,open,navigate]);
  // Keep the existing tracker visible. Recovery entry remains accessible
  // from other authenticated screens, including after terminal completion.
  if(!open&&pending===false&&(!NEW_SELECTION_ENABLED||path!=="/inicio"))return null;
  if(!open&&pending===null&&path!=="/inicio")return null;
  if(!open)return <div className="shrink-0 px-3 py-2 bg-zinc-900 text-white">
    <button type="button" className="w-full rounded-xl border border-white/20 p-3 text-sm font-bold"
      onClick={()=>{setFailure(false);setOpen(true)}}>{pending===false?"GPS próprio • piloto":"Verificar solicitação experimental"}</button>
  </div>;
  return <section className="absolute inset-0 z-[100] flex flex-col bg-zinc-950 text-white overflow-y-auto" aria-label="Navegação experimental">
    <div ref={mapRef} className={NEW_SELECTION_ENABLED?"h-[240px] shrink-0":"hidden"}/>
    <div ref={mountRef} className="p-4 space-y-3"/>
    {failure&&<p role="alert" className="p-4 text-amber-300">Não foi possível verificar a solicitação. Volte e tente novamente; nenhuma nova corrida será enviada.</p>}
    <button type="button" className="m-4 border border-white/20 rounded-xl p-3" onClick={()=>setOpen(false)}>Fechar painel</button>
  </section>;
}
