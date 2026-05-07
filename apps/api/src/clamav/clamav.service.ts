import { Injectable, Logger } from '@nestjs/common';

// SRS §4.3.4 — every uploaded resume is virus-scanned. The real ClamAV daemon
// runs in its own container behind a TCP socket; that integration is queued as
// a follow-up chip. For Phase 1 we ship a stub that always reports CLEAN, with
// one sentinel filename ("__INFECTED_TEST__.pdf") flipping to INFECTED so the
// upload-rejection path stays exercised by tests.

export type ScanResult = 'CLEAN' | 'INFECTED';

@Injectable()
export class ClamAVService {
  private readonly logger = new Logger(ClamAVService.name);

  async scan(filename: string, _body: Buffer): Promise<ScanResult> {
    if (filename.includes('__INFECTED_TEST__')) {
      this.logger.warn(`scan flagged INFECTED for sentinel filename: ${filename}`);
      return 'INFECTED';
    }
    return 'CLEAN';
  }
}
