import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/AuthGuard";

import { BottomNavigation } from "@/components/BottomNavigation";
import { Toaster } from "@/components/ui/sonner";
import { LocationProvider } from "@/hooks/use-location";
import { PickupAddressProvider } from "@/hooks/use-pickup-address";
import { DestinationProvider } from "@/hooks/use-destination";
import { RideStopsProvider } from "@/hooks/rides/use-ride-stops";
import { DestinationHistoryProvider } from "@/hooks/use-destination-history";
import { RouteProvider } from "@/hooks/use-route";
import { RideCategoriesProvider } from "@/hooks/use-ride-categories";
import { PricingProvider } from "@/hooks/use-pricing";
import { PaymentMethodsProvider } from "@/hooks/use-payment-methods";
import { WalletProvider } from "@/hooks/use-wallet";
import { CouponProvider } from "@/hooks/use-coupon";
import { CheckoutPreparationProvider } from "@/hooks/use-checkout-preparation";
import { RideRequestProvider } from "@/hooks/rides/use-ride-request";
import { ActiveRideProvider } from "@/hooks/rides/use-active-ride";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AuthGuard>
      <LocationProvider>
        <PickupAddressProvider>
          <DestinationProvider>
            <RideStopsProvider>
              <DestinationHistoryProvider>
                <RouteProvider>
                  <RideCategoriesProvider>
                    <PricingProvider>
                      <PaymentMethodsProvider>
                        <WalletProvider>
                          <CouponProvider>
                            <CheckoutPreparationProvider>
                              <RideRequestProvider>
                                <ActiveRideProvider>
                                    <div className="min-h-[100dvh] bg-zinc-950 flex justify-center selection:bg-yellow-500/30 overflow-hidden">
                                      <div className="relative w-full max-w-[430px] h-[100dvh] bg-black overflow-hidden flex flex-col">
                                        <div className="flex-1 relative overflow-hidden">
                                          <Outlet />
                                        </div>
                                        <BottomNavigation />
                                        <Toaster />
                                      </div>
                                    </div>
                                </ActiveRideProvider>
                              </RideRequestProvider>
                            </CheckoutPreparationProvider>
                          </CouponProvider>
                        </WalletProvider>
                      </PaymentMethodsProvider>
                    </PricingProvider>
                  </RideCategoriesProvider>
                </RouteProvider>
              </DestinationHistoryProvider>
            </RideStopsProvider>
          </DestinationProvider>
        </PickupAddressProvider>
      </LocationProvider>
    </AuthGuard>
  );
}
