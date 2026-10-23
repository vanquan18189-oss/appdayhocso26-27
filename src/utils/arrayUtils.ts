export const stableShuffle = <T,>(array: T[], seed: string): T[] => {
  const newArray = [...array];
  let seedValue = seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seedValue++ + i) * 10000) % (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const MATCHING_PAIRS_COLORS = [
  'bg-blue-500', 'bg-orange-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-pink-500', 'bg-teal-500', 'bg-rose-500', 'bg-amber-500'
];

export const getMatchingPairColor = (index: number) => {
  return MATCHING_PAIRS_COLORS[index % MATCHING_PAIRS_COLORS.length];
};
