export async function appFetch(input: string, init?: RequestInit) {
  if (process.env.NEXT_PUBLIC_DEVICE_APP !== "1") return fetch(input, init);
  const { handleDeviceRequest } = await import("./device-handlers");
  return handleDeviceRequest(input);
}
