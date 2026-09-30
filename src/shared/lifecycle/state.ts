let acceptingTraffic = true;

export function isAcceptingTraffic(): boolean {
  return acceptingTraffic;
}

export function markDraining(): void {
  acceptingTraffic = false;
}

export function resetLifecycleForTests(): void {
  acceptingTraffic = true;
}
