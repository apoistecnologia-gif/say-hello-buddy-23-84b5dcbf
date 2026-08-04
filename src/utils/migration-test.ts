import { supabase } from "@/integrations/supabase/client";

export const testOfficialProject = async () => {
  console.log("Starting official project validation...");

  // 1. Check current project config
  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.log("Current session:", session ? "Active" : "None");

  // 2. Test a public read (ride_categories)
  const { data: categories, error: catError } = await supabase
    .from("ride_categories")
    .select("id, name")
    .limit(1);

  if (catError) {
    console.error("Failed to read categories (RLS/Connection error):", catError);
    return { success: false, error: catError.message };
  }

  console.log(
    "Successfully connected to wqbtnfbvqtkyywfcqjwa. Categories found:",
    categories?.length > 0,
  );

  return {
    success: true,
    url: import.meta.env["VITE_SUPABASE_URL"],
    categoriesCount: categories?.length,
  };
};
