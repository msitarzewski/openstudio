# Performance Monitoring Setup Guide - OpenStudio Testing

This guide provides detailed instructions for setting up performance monitoring tools across different platforms and browsers.

---

## Overview

For accurate stability and performance testing, you need to monitor:
1. **CPU Usage** - Browser and system-wide
2. **Memory Usage** - JavaScript heap and total memory
3. **Network Bandwidth** - Upload/download per connection
4. **Audio Performance** - Web Audio API metrics
5. **Browser Performance** - JavaScript execution, rendering, GC

---

## Quick Start Checklist

- [ ] System monitor running (Task Manager / Activity Monitor / htop)
- [ ] Browser DevTools open (F12)
- [ ] Performance tab ready for recording
- [ ] Memory tab ready for snapshots
- [ ] Network tab cleared and recording
- [ ] Console open for debug commands
- [ ] Stopwatch/timer ready for latency measurements
- [ ] Spreadsheet open for data recording

---

## Platform-Specific Setup

### Linux

#### System Monitoring

**Option 1: htop (Recommended)**
```bash
# Install if not present
sudo apt install htop  # Debian/Ubuntu
sudo dnf install htop  # Fedora
sudo pacman -S htop    # Arch

# Run with filtering for Chrome
htop -p $(pgrep -d',' chrome)
```

**Key columns to watch**:
- `CPU%` - Per-process CPU percentage
- `RES` - Resident memory (actual RAM used)
- `TIME+` - Total CPU time

**Option 2: top**
```bash
# Monitor Chrome processes
top -p $(pgrep -d',' chrome)

# Refresh every 1 second
top -d 1 -p $(pgrep -d',' chrome)
```

**Option 3: System Monitor (GUI)**
```bash
# GNOME System Monitor
gnome-system-monitor

# KDE System Monitor
ksysguard
```

#### Network Monitoring

**iftop** (Real-time bandwidth):
```bash
# Install
sudo apt install iftop

# Monitor network interface (replace eth0 with your interface)
sudo iftop -i eth0

# Show only traffic to/from specific host
sudo iftop -i eth0 -f "host 192.168.1.100"
```

**nethogs** (Per-process bandwidth):
```bash
# Install
sudo apt install nethogs

# Monitor
sudo nethogs eth0
```

**Browser Built-in** (Easiest):
- Chrome DevTools → Network tab (see browser section below)

---

### macOS

#### System Monitoring

**Activity Monitor (GUI - Recommended)**
```bash
# Launch Activity Monitor
open -a "Activity Monitor"
```

**In Activity Monitor**:
1. Click "CPU" tab - Sort by % CPU
2. Click "Memory" tab - View memory pressure
3. Click "Network" tab - View bandwidth
4. Use search to filter for "Google Chrome" or "Firefox"

**Terminal Commands**:
```bash
# CPU usage for Chrome
top -pid $(pgrep Chrome | head -1)

# Update every 1 second
top -s 1 -pid $(pgrep Chrome | head -1)

# Memory usage
ps aux | grep Chrome | awk '{print $4, $11}'
```

#### Network Monitoring

**Activity Monitor** (easiest):
- Click "Network" tab
- View "Data received/sec" and "Data sent/sec"

**nettop** (Terminal):
```bash
# Monitor network usage per process
sudo nettop -m route

# Filter for Chrome
sudo nettop -m route | grep Chrome
```

---

### Windows

#### System Monitoring

**Task Manager (Recommended)**
1. Press `Ctrl+Shift+Esc` to open Task Manager
2. Click "More details" if in simple view
3. Go to "Processes" tab
4. Click "Name" to sort alphabetically
5. Locate "Google Chrome" or "Firefox" processes
6. Right-click header → Select columns:
   - [x] CPU
   - [x] Memory
   - [x] Network
   - [x] GPU (optional)

**Viewing per-tab usage**:
1. In Chrome, click Menu (⋮) → More Tools → Task Manager
2. Shows CPU/Memory per tab and process

**Resource Monitor (Advanced)**
```powershell
# Launch Resource Monitor
perfmon /res
```

**PowerShell Monitoring**:
```powershell
# Get Chrome CPU/Memory usage
Get-Process chrome | Select-Object Name, CPU, WS -AutoSize

# Continuous monitoring (update every 5 seconds)
while($true) {
  Clear-Host
  Get-Process chrome | Select-Object Name, CPU, @{Name="Memory(MB)";Expression={$_.WS/1MB}} | Format-Table
  Start-Sleep -Seconds 5
}
```

---

## Browser DevTools Setup

### Chrome DevTools (Recommended for testing)

#### Performance Tab

**Purpose**: Record JavaScript execution, rendering, and system activity

**Setup**:
1. Open DevTools: `F12` or `Ctrl+Shift+I` (Windows/Linux) / `Cmd+Opt+I` (macOS)
2. Click "Performance" tab
3. Click settings gear ⚙️ for options:
   - [x] Screenshots (visual timeline)
   - [x] Memory (track allocations)
   - [ ] Web Vitals (not needed for this test)
   - [x] Enable advanced paint instrumentation

**Recording a session**:
1. Click red record button (or `Ctrl+E`)
2. Perform test actions (join session, talk, etc.)
3. Click stop button after 5-10 minutes
4. Wait for processing
5. Analyze results (see analysis section below)

**What to look for**:
- **Summary tab**: Breakdown of time (Scripting, Rendering, Painting, System, Idle)
- **Bottom-Up tab**: Functions consuming most CPU
- **Call Tree tab**: Hierarchical view of function calls
- **Event Log tab**: Chronological list of events

#### Memory Tab

**Purpose**: Detect memory leaks, analyze heap usage

**Taking heap snapshots**:
1. Click "Memory" tab
2. Select "Heap snapshot" radio button
3. Click "Take snapshot" button
4. Wait for capture (few seconds)
5. Repeat at intervals: 0 min, 30 min, 60 min

**Comparing snapshots**:
1. Take multiple snapshots over time
2. Click second snapshot
3. Change dropdown from "Summary" to "Comparison"
4. Select first snapshot as baseline
5. Look for objects with increasing retention

**What to look for**:
- **Shallow Size**: Memory used by object itself
- **Retained Size**: Memory freed if object is garbage collected
- **Distance**: Distance from GC root (larger = more likely leak)

#### Network Tab

**Purpose**: Monitor WebRTC bandwidth, signaling traffic

**Setup**:
1. Click "Network" tab
2. Click preserve log checkbox (keeps history across page reloads)
3. Optional: Filter by "WS" (WebSocket) to see signaling messages

**During test**:
- Monitor "Size" column for total data transferred
- Monitor "Time" column for request duration
- Check "Waterfall" for timing visualization

**Measuring bandwidth**:
1. Note initial "transferred" value (bottom status bar)
2. Wait 1 minute
3. Note new "transferred" value
4. Calculate: (new - initial) / 60 seconds = kbps

#### Console Tab

**Purpose**: Run debug commands, view errors/warnings

**Useful commands for OpenStudio**:
```javascript
// Memory usage
console.log(`Memory: ${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)} MB`);

// Audio graph information
console.log(audioGraph.getGraphInfo());

// Audio context state
console.log(`AudioContext: ${audioContextManager.getState()}`);

// Connection manager state
console.log(connectionManager.getConnectionsInfo());

// Mute manager state
console.log(muteManager.getAllMuteStates());

// Icecast streamer status
console.log(icecastStreamer.getStatus());

// Program bus info
console.log(audioGraph.getProgramBus().getInfo());

// Volume meter state
console.log(volumeMeter.getMetrics());
```

**Continuous monitoring** (run once, updates every 5s):
```javascript
setInterval(() => {
  const mem = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
  const cpu = 'N/A'; // CPU not directly accessible via JS
  console.log(`[${new Date().toLocaleTimeString()}] Memory: ${mem} MB`);
}, 5000);
```

---

### Firefox Developer Tools

#### Performance Tab

**Setup**:
1. Open DevTools: `F12` or `Ctrl+Shift+I` (Windows/Linux) / `Cmd+Opt+I` (macOS)
2. Click "Performance" tab
3. Click settings gear ⚙️:
   - [x] Show Gecko Platform Data
   - [x] Record Memory

**Recording**:
1. Click "Start Recording Performance"
2. Perform test actions
3. Click "Capture Recording" after 5-10 minutes

**Analysis**:
- **Waterfall**: Visual timeline of browser activity
- **Call Tree**: Function call hierarchy
- **Flame Graph**: Visual representation of call stack

#### Memory Tab

**Setup**:
1. Click "Memory" tab
2. Select "Take snapshot"

**Snapshot types**:
- **Tree Map**: Visual representation of memory usage
- **Census**: Grouped by object type
- **Dominators**: Objects preventing garbage collection

#### Network Tab

**Setup**:
1. Click "Network" tab
2. Click "Persist logs" (retains data across reloads)

**Filtering**:
- Click "WS" to show only WebSocket traffic
- Click "Media" to show media streams

---

### Safari Web Inspector (macOS only)

#### Enabling Developer Tools
1. Safari → Settings → Advanced
2. Check "Show Develop menu in menu bar"

#### Timelines Tab
1. Develop → Show Web Inspector
2. Click "Timelines" tab
3. Click record button

**Available timelines**:
- **Network**: Resource loading
- **Layout & Rendering**: Page rendering
- **JavaScript & Events**: Script execution
- **Media & Animations**: Media playback

---

## Automated Data Collection

### Chrome Performance API

**Save to file using browser console**:
```javascript
// Collect data every 5 seconds for 1 hour
const data = [];
const interval = setInterval(() => {
  if (data.length >= 720) { // 1 hour at 5s intervals
    clearInterval(interval);
    console.log('Data collection complete');

    // Convert to CSV
    const csv = 'timestamp,memory_mb\n' +
      data.map(d => `${d.time},${d.memory}`).join('\n');

    // Download CSV
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openstudio-performance.csv';
    a.click();
    return;
  }

  data.push({
    time: new Date().toISOString(),
    memory: (performance.memory.usedJSHeapSize / 1048576).toFixed(2)
  });
}, 5000);
```

### System Monitoring Scripts

#### Linux Script
```bash
#!/bin/bash
# Save as: monitor-chrome.sh

OUTPUT_FILE="chrome-performance.csv"
echo "timestamp,cpu_percent,memory_mb" > "$OUTPUT_FILE"

# Monitor for 1 hour (3600 seconds), sample every 5 seconds
for i in {1..720}; do
  TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

  # Sum CPU usage of all Chrome processes
  CPU=$(ps aux | grep chrome | grep -v grep | awk '{sum+=$3} END {print sum}')

  # Sum memory usage (RSS in KB, convert to MB)
  MEM=$(ps aux | grep chrome | grep -v grep | awk '{sum+=$6} END {print sum/1024}')

  echo "$TIMESTAMP,$CPU,$MEM" >> "$OUTPUT_FILE"
  sleep 5
done

echo "Monitoring complete. Data saved to $OUTPUT_FILE"
```

**Usage**:
```bash
chmod +x monitor-chrome.sh
./monitor-chrome.sh &
# Returns PID, use 'kill <PID>' to stop early
```

#### macOS Script
```bash
#!/bin/bash
# Save as: monitor-chrome.sh

OUTPUT_FILE="chrome-performance.csv"
echo "timestamp,cpu_percent,memory_mb" > "$OUTPUT_FILE"

for i in {1..720}; do
  TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

  # Get Chrome processes (requires different ps flags on macOS)
  CPU=$(ps aux | grep "Google Chrome" | grep -v grep | awk '{sum+=$3} END {print sum}')
  MEM=$(ps aux | grep "Google Chrome" | grep -v grep | awk '{sum+=$6} END {print sum/1024}')

  echo "$TIMESTAMP,$CPU,$MEM" >> "$OUTPUT_FILE"
  sleep 5
done

echo "Monitoring complete. Data saved to $OUTPUT_FILE"
```

#### Windows PowerShell Script
```powershell
# Save as: monitor-chrome.ps1

$OutputFile = "chrome-performance.csv"
"timestamp,cpu_percent,memory_mb" | Out-File $OutputFile

# Monitor for 1 hour, sample every 5 seconds
for ($i = 1; $i -le 720; $i++) {
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    # Get Chrome processes
    $ChromeProcesses = Get-Process chrome -ErrorAction SilentlyContinue

    if ($ChromeProcesses) {
        $TotalCPU = ($ChromeProcesses | Measure-Object -Property CPU -Sum).Sum
        $TotalMemoryMB = ($ChromeProcesses | Measure-Object -Property WS -Sum).Sum / 1MB

        "$Timestamp,$TotalCPU,$TotalMemoryMB" | Out-File $OutputFile -Append
    }

    Start-Sleep -Seconds 5
}

Write-Host "Monitoring complete. Data saved to $OutputFile"
```

**Usage**:
```powershell
powershell -ExecutionPolicy Bypass -File monitor-chrome.ps1
```

---

## Latency Measurement Tools

### Mute Latency Measurement

**Method 1: Stopwatch (Lowest Tech)**
1. Use phone stopwatch or online timer (https://www.online-stopwatch.com/)
2. Initiator: Start timer when clicking mute button
3. Target: Say "MUTED" when you can no longer hear yourself
4. Initiator: Stop timer, record milliseconds

**Method 2: Video Recording (Most Accurate)**
1. Screen record both participants simultaneously
2. Review video frame-by-frame
3. Count frames between button click and audio change
4. Calculate: (frames / fps) * 1000 = latency in ms

**Method 3: Browser Performance Timeline**
1. Start Chrome Performance recording
2. Perform mute action
3. Stop recording
4. Find user click event and audio graph gain change
5. Calculate time delta

### Glass-to-Glass Latency

**Method 1: Clap Test**
1. Synchronize system clocks (use https://time.is)
2. Host: Claps hands loudly
3. Remote: Records exact time they hear clap
4. Calculate: remote_time - host_time = latency

**Method 2: Video Synchronization**
1. Both participants enable video (if available in future)
2. Host: Shows stopwatch on screen
3. Remote: Records when they see time update vs when they hear audio
4. Calculate latency from time delta

**Method 3: Audio Loopback (Advanced)**
Requires specialized software (not standard in MVP)

---

## Data Collection Best Practices

### Sampling Intervals

**Real-time observation**: Every 5 minutes manually record:
- CPU percentage
- Memory usage (MB)
- Current activity
- Any anomalies

**Automated logging**: Every 5 seconds record:
- Timestamp
- CPU usage
- Memory usage
- (Optional) Network throughput

**Why 5 seconds**: Balance between data granularity and storage

### Data Recording Template

**Spreadsheet columns**:
| Timestamp | CPU % | Memory MB | Activity | Notes |
|-----------|-------|-----------|----------|-------|
| 00:00:00  | 15%   | 250 MB    | Session start | All joined |
| 00:05:00  | 22%   | 285 MB    | Normal talk | |
| 00:10:00  | 24%   | 292 MB    | Mute test | |
| ...       | ...   | ...       | ...      | ... |

### Continuous Monitoring Checklist

During 60-minute test, monitor continuously for:
- [ ] CPU spikes (sudden increases >50%)
- [ ] Memory growth trend (steady increase = leak)
- [ ] Console errors (red text in browser console)
- [ ] Audio dropouts (gaps in audio, reported by participants)
- [ ] Connection status changes (disconnected/reconnected)
- [ ] UI freezes or lag
- [ ] Browser warnings or prompts

---

## Analysis After Test

### CPU Analysis

**Expected behavior**:
- Baseline (browser open, no session): 2-5%
- Idle session (6 participants, no audio): 10-15%
- Normal talking: 20-30%
- Peak (all talking): 30-40%

**Red flags**:
- Average >40% (system overloaded)
- Spikes >80% (performance bottleneck)
- Increasing trend (inefficient code)

**Action**: If red flags present, profile with Chrome Performance tab to identify bottleneck functions

### Memory Analysis

**Expected behavior**:
- Baseline (browser open, no session): 100-150 MB
- After 6 participants join: 300-400 MB
- During 60-minute session: Stable or slight growth (<50 MB)

**Red flags**:
- Initial >500 MB (inefficient initialization)
- Growth >100 MB/hour (memory leak)
- Doesn't decrease when participants leave (retained references)

**Action**: Take heap snapshots, compare before/after, identify retained objects

### Network Analysis

**Expected bitrates** (per peer):
- Microphone track: ~40-60 kbps (Opus)
- Return feed track: ~40-60 kbps (Opus)
- Signaling: <1 kbps (minimal overhead)

**For 6-participant session**:
- Upload: ~250-300 kbps (send to 5 peers)
- Download: ~250-300 kbps (receive from 5 peers)
- Icecast (host only): +128-192 kbps (configurable)

**Red flags**:
- Bandwidth >500 kbps per direction (inefficient encoding)
- Spiky traffic (should be steady)
- Increasing over time (connection not stable)

---

## Troubleshooting Monitoring Issues

### Chrome DevTools Not Showing Memory Tab

**Issue**: performance.memory is undefined

**Cause**: Memory API disabled in browser

**Fix**:
1. Enable: chrome://flags/#enable-precise-memory-info
2. Set to "Enabled"
3. Restart browser

### System Monitor Shows No Chrome Processes

**Linux**:
```bash
# Check if Chrome is running
ps aux | grep chrome

# If nothing, browser might be named differently
ps aux | grep -i chrom
```

**macOS**:
```bash
ps aux | grep "Google Chrome"
```

**Windows**:
```powershell
Get-Process | Where-Object {$_.Name -like "*chrome*"}
```

### High CPU but No Obvious Cause

**Action**:
1. Close unnecessary browser tabs
2. Disable browser extensions (test in incognito)
3. Record Chrome Performance profile
4. Look for long-running functions in Bottom-Up view
5. Check for infinite loops or excessive DOM updates

### Memory Leak Suspected

**Confirmation steps**:
1. Take heap snapshot before test
2. Take heap snapshot after 30 minutes
3. Take heap snapshot after 60 minutes
4. Compare: Should see similar retained objects
5. If snapshot 3 >> snapshot 2 >> snapshot 1, leak confirmed

**Investigation**:
1. Compare snapshots (Comparison view)
2. Look for objects with unexpected large counts
3. Check "Retainers" to see what's holding references
4. Common culprits: Event listeners, timers, WebRTC connections

---

## Quick Reference Card

**Print this for easy reference during test**:

### Chrome DevTools Shortcuts
- `F12` - Open DevTools
- `Ctrl+Shift+P` - Command palette
- `Ctrl+E` - Start/stop Performance recording
- `Ctrl+L` - Clear console
- `Ctrl+Shift+Delete` - Clear browser data

### Important Console Commands
```javascript
// Memory
performance.memory.usedJSHeapSize / 1048576 + ' MB'

// Audio Graph
audioGraph.getGraphInfo()

// Connections
connectionManager.getConnectionsInfo()

// Streaming
icecastStreamer.getStatus()
```

### System Monitor Hotkeys
- **Windows**: `Ctrl+Shift+Esc` (Task Manager)
- **macOS**: `Cmd+Space` → "Activity Monitor"
- **Linux**: `Ctrl+Alt+Delete` or run `htop` in terminal

### Data Collection Intervals
- **Manual observation**: Every 5 minutes
- **Automated logging**: Every 5 seconds
- **Heap snapshots**: 0, 30, 60 minutes
- **Performance recording**: 5-10 minute samples

---

## Support Resources

- **Chrome DevTools Docs**: https://developer.chrome.com/docs/devtools/
- **Firefox Developer Tools**: https://firefox-source-docs.mozilla.org/devtools-user/
- **Web Audio API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **WebRTC Stats**: chrome://webrtc-internals

For issues specific to OpenStudio, consult the Memory Bank documentation in `/memory-bank/`.
