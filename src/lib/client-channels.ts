export const RANDOMISER_CHANNELS = [
  { id: "tcg", label: "PokebabsiTCG" },
  { id: "op", label: "PokebabsiOP" },
  { id: "energy", label: "Energy Breaks" },
] as const;

export type RandomiserChannel = (typeof RANDOMISER_CHANNELS)[number]["id"];

export const DEFAULT_RANDOMISER_CHANNEL: RandomiserChannel = "tcg";

export function resolveRandomiserChannel(value: string | null | undefined): RandomiserChannel {
  return RANDOMISER_CHANNELS.some((channel) => channel.id === value) ? (value as RandomiserChannel) : DEFAULT_RANDOMISER_CHANNEL;
}

export function getRandomiserChannelLabel(channel: RandomiserChannel): string {
  return RANDOMISER_CHANNELS.find((entry) => entry.id === channel)?.label ?? "PokebabsiTCG";
}
