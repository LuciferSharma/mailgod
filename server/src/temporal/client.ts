import { Client, Connection } from '@temporalio/client';
import { config } from '../config';

let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;

  try {
    const connection = await Connection.connect({
      address: config.temporalAddress,
    });
    client = new Client({ connection, namespace: config.temporalNamespace });
    console.log('Temporal client connected:', config.temporalAddress);
    return client;
  } catch (error) {
    console.warn('Temporal not available, running without workflow engine');
    throw error;
  }
}
