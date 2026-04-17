export type RandomiserChannel = "tcg" | "op" | "energy";

export const DEFAULT_RANDOMISER_CHANNEL: RandomiserChannel = "tcg";

export function resolveRandomiserChannel(value: string | null | undefined): RandomiserChannel {
  return value === "tcg" || value === "op" || value === "energy" ? value : DEFAULT_RANDOMISER_CHANNEL;
}
