import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export interface AuditTrace {
  trace_id: string;
  query_hash: string;
  engines_used: string[];
  timestamp: string;
  query: string;
  domain: string;
  confidence: number;
  hash_chain: string;
}

export function generateAuditTrace(
  query: string,
  domain: string,
  engines: string[],
  confidence: number
): AuditTrace {
  const trace_id = uuidv4();
  const query_hash = crypto.createHash('sha256').update(query).digest('hex').slice(0, 16);
  const timestamp = new Date().toISOString();
  // Hash chain: SHA256 of trace_id + query_hash + timestamp
  const hash_chain = crypto
    .createHash('sha256')
    .update(`${trace_id}:${query_hash}:${timestamp}`)
    .digest('hex');

  return {
    trace_id,
    query_hash,
    engines_used: engines,
    timestamp,
    query,
    domain,
    confidence,
    hash_chain,
  };
}
