/** A recorded PostgREST call made through {@link createFakeSupabase}. */
export type FakeQueryCall = {
  table: string;
  columns?: string;
  head?: boolean;
  filters: Record<string, unknown>;
  ins: Record<string, unknown[]>;
  update?: Record<string, unknown>;
  insert?: Record<string, unknown>;
  range?: [number, number];
};

export type FakeQueryResult = { data?: unknown; error?: unknown; count?: number | null };

class FakeQuery {
  constructor(
    private readonly call: FakeQueryCall,
    private readonly resolve: (call: FakeQueryCall) => FakeQueryResult
  ) {}

  select(columns: string, options?: { head?: boolean }) {
    this.call.columns = columns;
    if (options?.head) this.call.head = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.filters[column] = value;
    return this;
  }

  is(column: string, value: unknown) {
    this.call.filters[column] = value;
    return this;
  }

  in(column: string, values: unknown[]) {
    this.call.ins[column] = values;
    return this;
  }

  order() {
    return this;
  }

  range(from: number, to: number) {
    this.call.range = [from, to];
    return this;
  }

  update(values: Record<string, unknown>) {
    this.call.update = values;
    return this;
  }

  insert(values: Record<string, unknown>) {
    this.call.insert = values;
    return this;
  }

  single() {
    return Promise.resolve(this.result());
  }

  maybeSingle() {
    return Promise.resolve(this.result());
  }

  then<T>(onFulfilled: (result: FakeQueryResult) => T, onRejected?: (reason: unknown) => T) {
    return Promise.resolve(this.result()).then(onFulfilled, onRejected);
  }

  private result(): FakeQueryResult {
    return { data: null, error: null, ...this.resolve(this.call) };
  }
}

/**
 * Minimal Supabase admin-client stand-in for route tests. Every query is
 * recorded in `calls` and answered by `resolve`, keyed on table and filters.
 */
export function createFakeSupabase(
  resolve: (call: FakeQueryCall) => FakeQueryResult,
  usersByToken: Record<string, string> = {}
) {
  const calls: FakeQueryCall[] = [];
  const client = {
    auth: {
      getUser: async (token: string) => {
        const id = usersByToken[token];
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: new Error('invalid') };
      },
    },
    from: (table: string) => {
      const call: FakeQueryCall = { table, filters: {}, ins: {} };
      calls.push(call);
      return new FakeQuery(call, resolve);
    },
  };
  return { client, calls };
}
