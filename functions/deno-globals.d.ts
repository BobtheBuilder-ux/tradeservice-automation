declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module 'npm:@insforge/sdk' {
  export function createClient(config: Record<string, unknown>): any;
}

declare module 'npm:twilio' {
  const twilio: any;
  export default twilio;
}
