export const uiPort = 80
export const apiPort = 4000
export const pgPort = 5432
export const dbName = 'fleet'
export const dbUser = 'fleet'
export const adminUsername = 'admin'

export const pgMount = '/home/postgres/pgdata'
export const pgdataPath = '/data'

export const profiles = ['mini', 'standard', 'max'] as const
export type Profile = (typeof profiles)[number]

// Upstream's defaults for every key a profile in
// proto-fleet/deployment-files/profiles/ can override, from its compose files.
export const profileDefaults: Record<string, string> = {
  PG_MAX_CONNECTIONS: '300',
  PG_SHARED_BUFFERS: '256MB',
  PG_EFFECTIVE_CACHE_SIZE: '768MB',
  PG_MAINTENANCE_WORK_MEM: '64MB',
  PG_CHECKPOINT_TIMEOUT: '5min',
  PG_WAL_BUFFERS: '16MB',
  PG_WAL_COMPRESSION: 'off',
  PG_RANDOM_PAGE_COST: '1.1',
  PG_EFFECTIVE_IO_CONCURRENCY: '200',
  PG_WORK_MEM: '32MB',
  PG_TEMP_FILE_LIMIT: '-1',
  PG_MIN_WAL_SIZE: '1GB',
  PG_MAX_WAL_SIZE: '4GB',
  PG_MAX_WORKER_PROCESSES: '19',
  PG_MAX_PARALLEL_WORKERS_PER_GATHER: '4',
  PG_MAX_PARALLEL_WORKERS: '8',
  PG_MAX_PARALLEL_MAINTENANCE_WORKERS: '4',
  PG_TS_MAX_BACKGROUND_WORKERS: '8',
  PG_TRACK_IO_TIMING: 'on',
  PG_LOG_MIN_DURATION_STATEMENT: '5000',
  DB_MAX_OPEN_CONNS: '250',
  DB_MAX_IDLE_CONNS: '50',
  TELEMETRY_FETCH_INTERVAL: '5s',
  TELEMETRY_STALENESS_THRESHOLD: '20s',
  TELEMETRY_CONCURRENCY_LIMIT: '1500',
  TELEMETRY_METRIC_TIMEOUT: '5s',
  TIMESCALEDB_QUERY_TIMEOUT: '60s',
  TIMESCALEDB_MAX_TIME_SERIES_ROWS: '100000',
  TIMESCALEDB_ASYNC_METRIC_COMMIT: 'false',
  FLEET_COMMAND_MAX_WORKERS: '500',
}

export function parseEnvFile(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  )
}

// The postgres command-line flags upstream's docker-compose.base.yaml passes.
export function postgresArgs(p: Record<string, string>): string[] {
  return [
    `listen_addresses=127.0.0.1`,
    `max_connections=${p.PG_MAX_CONNECTIONS}`,
    `shared_buffers=${p.PG_SHARED_BUFFERS}`,
    `effective_cache_size=${p.PG_EFFECTIVE_CACHE_SIZE}`,
    `maintenance_work_mem=${p.PG_MAINTENANCE_WORK_MEM}`,
    'checkpoint_completion_target=0.9',
    `checkpoint_timeout=${p.PG_CHECKPOINT_TIMEOUT}`,
    `wal_buffers=${p.PG_WAL_BUFFERS}`,
    `wal_compression=${p.PG_WAL_COMPRESSION}`,
    'default_statistics_target=100',
    `random_page_cost=${p.PG_RANDOM_PAGE_COST}`,
    `effective_io_concurrency=${p.PG_EFFECTIVE_IO_CONCURRENCY}`,
    `work_mem=${p.PG_WORK_MEM}`,
    `temp_file_limit=${p.PG_TEMP_FILE_LIMIT}`,
    `min_wal_size=${p.PG_MIN_WAL_SIZE}`,
    `max_wal_size=${p.PG_MAX_WAL_SIZE}`,
    `max_worker_processes=${p.PG_MAX_WORKER_PROCESSES}`,
    `max_parallel_workers_per_gather=${p.PG_MAX_PARALLEL_WORKERS_PER_GATHER}`,
    `max_parallel_workers=${p.PG_MAX_PARALLEL_WORKERS}`,
    `max_parallel_maintenance_workers=${p.PG_MAX_PARALLEL_MAINTENANCE_WORKERS}`,
    `timescaledb.max_background_workers=${p.PG_TS_MAX_BACKGROUND_WORKERS}`,
    'shared_preload_libraries=timescaledb,pg_stat_statements',
    'pg_stat_statements.track_utility=off',
    `track_io_timing=${p.PG_TRACK_IO_TIMING}`,
    `log_min_duration_statement=${p.PG_LOG_MIN_DURATION_STATEMENT}`,
    'log_parameter_max_length=0',
    'log_parameter_max_length_on_error=0',
  ].flatMap((a) => ['-c', a])
}
