import { useState, useEffect, useCallback } from "react";

export type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "granted"; lat: number; lng: number }
  | { status: "denied"; message: string }
  | { status: "error"; message: string };

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ status: "error", message: "Geolocation is not supported by your browser." });
      return;
    }
    setState({ status: "loading" });

    const onSuccess = (pos: GeolocationPosition) => {
      setState({
        status: "granted",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    };

    const onError = (err: GeolocationPositionError, isRetry: boolean) => {
      if (err.code === err.PERMISSION_DENIED) {
        setState({ status: "denied", message: "Location access was denied." });
        return;
      }
      if (err.code === err.TIMEOUT && !isRetry) {
        // Retry with high accuracy and a longer timeout
        navigator.geolocation.getCurrentPosition(onSuccess, (e) => onError(e, true), {
          enableHighAccuracy: true,
          timeout: 25000,
          maximumAge: 600000,
        });
        return;
      }
      if (err.code === err.POSITION_UNAVAILABLE) {
        setState({
          status: "error",
          message: "Location unavailable. Check your device's location settings.",
        });
      } else if (err.code === err.TIMEOUT) {
        setState({
          status: "error",
          message: "Location timed out. Try again outdoors or with Wi-Fi on.",
        });
      } else {
        setState({ status: "error", message: err.message || "An unknown error occurred." });
      }
    };

    navigator.geolocation.getCurrentPosition(onSuccess, (e) => onError(e, false), {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 300000,
    });
  }, []);

  return { state, request };
}
