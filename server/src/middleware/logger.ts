import morgan from 'morgan';
import { config } from '../config';

morgan.token('request-id', (req: any) => req.id || '-');

const devFormat = ':method :url :status :response-time ms - :request-id';
const prodFormat = '{"method":":method","url":":url","status"::status,"time":":response-time","requestId":":request-id"}';

export const requestLogger = morgan(
  config.nodeEnv === 'production' ? prodFormat : devFormat
);
