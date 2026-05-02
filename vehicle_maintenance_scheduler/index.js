const axios = require('axios');
const { Log, setToken } = require('../logging_middleware');

const BASE = 'http://20.207.122.201/evaluation-service';

// fresh token needed every ~15 min — update this before running
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJlczczOTBAc3JtaXN0LmVkdS5pbiIsImV4cCI6MTc3NzcwMTc1OSwiaWF0IjoxNzc3NzAwODU5LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiNjgwYjNjNTQtNzU4YS00ZjQ1LWJjOGMtMDcxOTM1MmNkYzMxIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoiZXNoYSBzaGFybWEiLCJzdWIiOiJhMDk2ZTYzYi1hYTNjLTQwYzAtYjljYy1kMjQ4ODYwMDU3YzIifSwiZW1haWwiOiJlczczOTBAc3JtaXN0LmVkdS5pbiIsIm5hbWUiOiJlc2hhIHNoYXJtYSIsInJvbGxObyI6InJhMjMxMTAwMzAzMDM5OSIsImFjY2Vzc0NvZGUiOiJRa2JweEgiLCJjbGllbnRJRCI6ImEwOTZlNjNiLWFhM2MtNDBjMC1iOWNjLWQyNDg4NjAwNTdjMiIsImNsaWVudFNlY3JldCI6Im1zQWRhZ0JkRGVqS1NwUHQifQ.buWZzA1yTOoPLwNYQseKfUwWhjkENVeEEXcJAvKj5v4';

setToken(TOKEN);

const headers = { Authorization: `Bearer ${TOKEN}` };

async function getDepots() {
  await Log('backend', 'info', 'service', 'Fetching depots from server');
  const res = await axios.get(`${BASE}/depots`, { headers });
  return res.data.depots;
}

async function getVehicles() {
  await Log('backend', 'info', 'service', 'Fetching vehicles from server');
  const res = await axios.get(`${BASE}/vehicles`, { headers });
  return res.data.vehicles;
}

// classic 0/1 knapsack — tasks are items, mechanic hours is the weight limit
// using a 1D dp array instead of 2D to save memory
function knapsack(tasks, capacity) {
  const n = tasks.length;
  const dp = new Array(capacity + 1).fill(0);

  for (let i = 0; i < n; i++) {
    const { Duration, Impact } = tasks[i];
    // iterate backwards so we don't accidentally pick the same task twice
    for (let w = capacity; w >= Duration; w--) {
      if (dp[w - Duration] + Impact > dp[w]) {
        dp[w] = dp[w - Duration] + Impact;
      }
    }
  }

  // trace back to find out which tasks got selected
  const picked = [];
  let rem = capacity;
  for (let i = n - 1; i >= 0; i--) {
    const { Duration, Impact } = tasks[i];
    if (rem >= Duration && dp[rem] === dp[rem - Duration] + Impact) {
      picked.push(tasks[i]);
      rem -= Duration;
    }
  }

  return { maxImpact: dp[capacity], picked, used: capacity - rem };
}

async function run() {
  try {
    await Log('backend', 'info', 'service', 'Scheduler started');

    const [depots, vehicles] = await Promise.all([getDepots(), getVehicles()]);
    await Log('backend', 'info', 'db', `Loaded ${depots.length} depots, ${vehicles.length} tasks`);

    const output = [];

    for (const depot of depots) {
      await Log('backend', 'info', 'handler', `Depot ${depot.ID}: budget ${depot.MechanicHours}h`);

      const { maxImpact, picked, used } = knapsack(vehicles, depot.MechanicHours);

      await Log('backend', 'info', 'service', `Depot ${depot.ID}: impact=${maxImpact}`);

      output.push({
        depotID: depot.ID,
        mechanicHoursBudget: depot.MechanicHours,
        hoursUsed: used,
        totalImpact: maxImpact,
        taskCount: picked.length,
        tasks: picked.map(v => ({
          taskID: v.TaskID,
          duration: v.Duration,
          impact: v.Impact
        }))
      });
    }

    console.log('\n--- Scheduler Results ---\n');
    console.log(JSON.stringify(output, null, 2));

    await Log('backend', 'info', 'service', 'Scheduler completed successfully');
  } catch (err) {
    await Log('backend', 'fatal', 'service', 'Scheduler failed unexpectedly');
    console.error(err.message);
    process.exit(1);
  }
}

run();
