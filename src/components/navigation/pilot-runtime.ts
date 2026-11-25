import { supabase } from "@/integrations/supabase/client";
import { PILOT_INSTALLED } from "./pilot-config";
import { createPilotRuntime, type PilotHeaders } from "../../../experimental/apois-navigation/ui/pilot-runtime.mjs";

export const pilotRuntime=createPilotRuntime({
  installed:PILOT_INSTALLED,
  auth:{getUser:(token?:string)=>supabase.auth.getUser(token),getSession:()=>supabase.auth.getSession()},
  invoke:(name:string,options:Parameters<typeof supabase.functions.invoke>[1])=>supabase.functions.invoke(name,options),
});
export function withPilotCreation<T>(work:(headers:PilotHeaders|undefined)=>Promise<T>,account?:string):Promise<T>{
  return pilotRuntime.legacy(work,account);
}
