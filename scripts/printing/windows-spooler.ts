import { execFile } from 'node:child_process';

export type WindowsSpoolerState =
  | 'accepted'
  | 'spooled'
  | 'printed'
  | 'error'
  | 'unknown';

export type WindowsSpoolerSnapshot = {
  state: WindowsSpoolerState;
  jobId?: string;
  status?: string;
  error?: string;
};

const powershellScript = String.raw`
$ErrorActionPreference = 'Stop'
$printer = $env:NEXTSTOCK_SPOOLER_PRINTER
$document = $env:NEXTSTOCK_SPOOLER_DOCUMENT
$jobId = $env:NEXTSTOCK_SPOOLER_JOB_ID
try {
  $jobs = @(Get-PrintJob -PrinterName $printer -ErrorAction Stop)
  $job = $null
  if ($jobId) {
    $job = $jobs | Where-Object { "$($_.Id)" -eq $jobId } | Select-Object -First 1
  } else {
    $job = $jobs | Where-Object {
      "$($_.DocumentName)" -like "*$document*" -or "$($_.Name)" -like "*$document*"
    } | Select-Object -First 1
  }
  if (-not $job) {
    @{ state = 'not_found' } | ConvertTo-Json -Compress
    exit 0
  }
  $status = "$($job.JobStatus)"
  $state = if ($status -match 'Error|Blocked|Offline|PaperOut|UserIntervention|Paused') {
    'error'
  } else {
    'spooled'
  }
  @{
    state = $state
    jobId = "$($job.Id)"
    status = $status
  } | ConvertTo-Json -Compress
} catch {
  @{
    state = 'unknown'
    error = $_.Exception.Message
  } | ConvertTo-Json -Compress
}
`;

function normalizeSnapshot(value: unknown): WindowsSpoolerSnapshot {
  if (!value || typeof value !== 'object') {
    return { state: 'unknown', error: 'Invalid spooler response.' };
  }
  const item = value as Record<string, unknown>;
  const state = item.state;
  if (state === 'not_found') return { state: 'accepted' };
  if (
    state !== 'accepted' &&
    state !== 'spooled' &&
    state !== 'printed' &&
    state !== 'error' &&
    state !== 'unknown'
  ) {
    return { state: 'unknown', error: 'Unknown spooler state.' };
  }
  return {
    state,
    ...(typeof item.jobId === 'string' && item.jobId
      ? { jobId: item.jobId }
      : {}),
    ...(typeof item.status === 'string' && item.status
      ? { status: item.status }
      : {}),
    ...(typeof item.error === 'string' && item.error
      ? { error: item.error }
      : {}),
  };
}

export function parseWindowsSpoolerResponse(output: string): WindowsSpoolerSnapshot {
  try {
    return normalizeSnapshot(JSON.parse(output.trim()));
  } catch (error) {
    return {
      state: 'unknown',
      error: error instanceof Error ? error.message : 'Invalid spooler JSON.',
    };
  }
}

export async function queryWindowsSpooler(
  printerName: string,
  documentMarker: string,
  jobId?: string,
): Promise<WindowsSpoolerSnapshot> {
  if (process.platform !== 'win32') {
    return {
      state: 'error',
      error: 'Windows spooler status requires Windows 10/11 x64.',
    };
  }
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        powershellScript,
      ],
      {
        windowsHide: true,
        maxBuffer: 64 * 1024,
        env: {
          ...process.env,
          NEXTSTOCK_SPOOLER_PRINTER: printerName,
          NEXTSTOCK_SPOOLER_DOCUMENT: documentMarker,
          NEXTSTOCK_SPOOLER_JOB_ID: jobId || '',
        },
      },
      (error, stdout) => {
        if (error && !stdout.trim()) {
          resolve({
            state: 'unknown',
            error: error.message,
          });
          return;
        }
        const snapshot = parseWindowsSpoolerResponse(stdout);
        resolve(
          snapshot.state === 'accepted' && jobId
            ? { state: 'printed' }
            : snapshot,
        );
      },
    );
  });
}
