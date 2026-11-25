import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { PassengerNavigationPilot } from "@/components/navigation/PassengerNavigationPilot";

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
import { ActiveRideProvider, useActiveRide } from "@/hooks/rides/use-active-ride";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function ActiveRideRecovery() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { ride, screenState, isRecovering, recoverActiveRide } = useActiveRide();
  const navigationInFlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (isRecovering || screenState !== "active" || !ride?.id) return;

    const ridePath = `/corrida/${ride.id}`;
    if (pathname === ridePath || navigationInFlightRef.current === ride.id) return;

    navigationInFlightRef.current = ride.id;
    void navigate({
      to: "/corrida/$rideId",
      params: { rideId: ride.id },
      replace: true,
    }).finally(() => {
      navigationInFlightRef.current = null;
    });
  }, [isRecovering, navigate, pathname, ride?.id, screenState]);

  useEffect(() => {
    const recover = () => {
      void recoverActiveRide();
    };

    window.addEventListener("pageshow", recover);
    return () => window.removeEventListener("pageshow", recover);
  }, [recoverActiveRide]);

  return null;
}

function PushBootstrap() {
  usePushNotifications();
  return null;
}

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
                                  <ActiveRideRecovery />
                                  <PushBootstrap />
                                  <div className="min-h-[100dvh] bg-zinc-950 flex justify-center selection:bg-yellow-500/30 overflow-hidden">
                                    <div className="relative w-full max-w-[430px] h-[100dvh] bg-black overflow-hidden flex flex-col">
                                      <div className="flex-1 relative overflow-hidden flex flex-col">
                                        <Outlet />
                                      </div>
                                      <PassengerNavigationPilot />
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
