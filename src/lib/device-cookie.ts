export const DEVICE_FACILITY_COOKIE = "ltc_device_facility";
/** When set (with facility binding), PIN login opens this unit for every staff member on this browser. */
export const DEVICE_UNIT_COOKIE = "ltc_device_unit";

export function getDeviceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
}
