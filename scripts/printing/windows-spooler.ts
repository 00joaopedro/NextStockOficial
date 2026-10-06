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

const powershellQueryScript = String.raw`
$ErrorActionPreference = 'Stop'
$printer = $env:NEXTSTOCK_SPOOLER_PRINTER
$jobId = $env:NEXTSTOCK_SPOOLER_JOB_ID
try {
  $jobs = @(Get-PrintJob -PrinterName $printer -ErrorAction Stop)
  $job = $jobs | Where-Object { "$($_.Id)" -eq $jobId } | Select-Object -First 1
  if (-not $job) {
    @{ state = 'not_found' } | ConvertTo-Json -Compress
    exit 0
  }
  $status = "$($job.JobStatus)"
  $state = if ($status -match 'Printed') {
    'printed'
  } elseif ($status -match 'Error|Blocked|Offline|PaperOut|UserIntervention|Paused') {
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

const powershellSubmitScript = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public static class NextStockRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDataType;
  }

  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool OpenPrinter(
    string pPrinterName,
    out IntPtr phPrinter,
    IntPtr pDefault
  );

  [DllImport("winspool.drv", SetLastError = true)]
  private static extern int StartDocPrinter(
    IntPtr hPrinter,
    int level,
    DOCINFO pDocInfo
  );

  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool WritePrinter(
    IntPtr hPrinter,
    byte[] data,
    int count,
    out int written
  );

  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool ClosePrinter(IntPtr hPrinter);

  public static int Send(string printerName, string filePath) {
    IntPtr printer;
    if (!OpenPrinter(printerName, out printer, IntPtr.Zero)) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }

    var documentStarted = false;
    var pageStarted = false;
    try {
      var document = new DOCINFO {
        pDocName = "NextStock receipt",
        pOutputFile = null,
        pDataType = "RAW"
      };
      var jobId = StartDocPrinter(printer, 1, document);
      if (jobId <= 0) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      documentStarted = true;
      if (!StartPagePrinter(printer)) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      pageStarted = true;
      var data = File.ReadAllBytes(filePath);
      int written;
      if (!WritePrinter(printer, data, data.Length, out written) || written != data.Length) {
        throw new Win32Exception(Marshal.GetLastWin32Error());
      }
      return jobId;
    } finally {
      if (pageStarted) EndPagePrinter(printer);
      if (documentStarted) EndDocPrinter(printer);
      ClosePrinter(printer);
    }
  }
}
'@
try {
  $jobId = [NextStockRawPrinter]::Send(
    $env:NEXTSTOCK_SPOOLER_PRINTER,
    $env:NEXTSTOCK_SPOOLER_FILE
  )
  @{
    state = 'spooled'
    jobId = "$jobId"
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

export function parseWindowsSpoolerResponse(
  output: string,
): WindowsSpoolerSnapshot {
  try {
    return normalizeSnapshot(JSON.parse(output.trim()));
  } catch (error) {
    return {
      state: 'unknown',
      error: error instanceof Error ? error.message : 'Invalid spooler JSON.',
    };
  }
}

function runPowerShell(
  script: string,
  environment: Record<string, string>,
): Promise<WindowsSpoolerSnapshot> {
  if (process.platform !== 'win32') {
    return Promise.resolve({
      state: 'error',
      error: 'Windows spooler status requires Windows 10/11 x64.',
    });
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
        script,
      ],
      {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 64 * 1024,
        env: {
          ...process.env,
          ...environment,
        },
      },
      (error, stdout) => {
        if (error && !stdout.trim()) {
          resolve({
            state: 'unknown',
            error:
              error.killed || error.code === 'ETIMEDOUT'
                ? 'Windows spooler query timed out.'
                : error.message,
          });
          return;
        }
        resolve(parseWindowsSpoolerResponse(stdout));
      },
    );
  });
}

export function submitWindowsSpoolerJob(
  printerName: string,
  filePath: string,
): Promise<WindowsSpoolerSnapshot> {
  return runPowerShell(powershellSubmitScript, {
    NEXTSTOCK_SPOOLER_PRINTER: printerName,
    NEXTSTOCK_SPOOLER_FILE: filePath,
  });
}

export function queryWindowsSpooler(
  printerName: string,
  jobId: string,
): Promise<WindowsSpoolerSnapshot> {
  return runPowerShell(powershellQueryScript, {
    NEXTSTOCK_SPOOLER_PRINTER: printerName,
    NEXTSTOCK_SPOOLER_JOB_ID: jobId,
  }).then((snapshot) =>
    snapshot.state === 'accepted' ? { state: 'printed' } : snapshot,
  );
}
