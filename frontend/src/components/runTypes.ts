/** Runs a mutation that returns the updated value; resolves true on success. */
export type RunFn<T> = (op: () => Promise<T>) => Promise<boolean>
