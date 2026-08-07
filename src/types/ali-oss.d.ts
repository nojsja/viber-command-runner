declare module 'ali-oss' {
  import { Readable } from 'stream';

  interface OSSOptions {
    region: string;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    endpoint?: string;
    secure?: boolean;
  }

  interface GetResult {
    content: Buffer;
  }

  interface PutOptions {
    headers?: Record<string, string>;
  }

  export default class OSS {
    constructor(options: OSSOptions);
    get(name: string): Promise<GetResult>;
    put(name: string, file: Buffer | Readable | string, options?: PutOptions): Promise<unknown>;
  }
}
