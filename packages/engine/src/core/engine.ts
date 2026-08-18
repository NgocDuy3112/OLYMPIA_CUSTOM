import type { Result, DomainEvent } from "./result.js";

export interface TournamentEngine<
  TState,
  TAction,
  TPhase extends string = string,
> {
  readonly id: string;
  readonly name: string;
  readonly phases: readonly TPhase[];

  initMatch(matchCode: string): TState;
  startMatch(state: TState): Result<TState>;
  startPhase(state: TState, phase: TPhase): Result<TState>;
  endPhase(state: TState, phase: TPhase): Result<TState>;
  canStartPhase(state: TState, phase: TPhase): boolean;
  handleAction(state: TState, action: TAction): Result<TState>;
}

export type { Result, DomainEvent };
