import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/hooks/use-auth";
import { LocationProvider } from "@/hooks/use-location";
import { PickupAddressProvider } from "@/hooks/use-pickup-address";
import { DestinationProvider } from "@/hooks/use-destination";
import { RideStopsProvider } from "@/hooks/rides/use-ride-stops";
import { DestinationHistoryProvider } from "@/hooks/use-destination-history";
import { RouteProvider } from "@/hooks/use-route";
import { RideCategoriesProvider } from '@/hooks/use-ride-categories';
import { PricingProvider } from '@/hooks/use-pricing';
import { PaymentMethodsProvider } from '@/hooks/use-payment-methods';
import { WalletProvider } from '@/hooks/use-wallet';
import { CouponProvider } from '@/hooks/use-coupon';
import { CheckoutPreparationProvider } from '@/hooks/use-checkout-preparation';
import { RideRequestProvider } from '@/hooks/rides/use-ride-request';
import { BottomNavigation } from "@/components/BottomNavigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Toaster } from "@/components/ui/sonner";

const queryClient = new QueryClient();

export const Route = createRootRouteWithContext<{
  queryClient: typeof queryClient;
}>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
                                <AuthGuard>
                                  <div className="min-h-screen bg-black text-white selection:bg-yellow-500/30">
                                    <Outlet />
                                    <BottomNavigation />
                                    <Toaster />
                                  </div>
                                </AuthGuard>
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
      </AuthProvider>
    </QueryClientProvider>
  );
}
