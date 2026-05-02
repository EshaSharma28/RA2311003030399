const axios = require('axios');
const { Log, setToken } = require('./src/config/logger');

// manual mapping for weights - placement is highest priority
const weightMap = {
  Placement: 3,
  Result: 2,
  Event: 1
};

// calculate priority score using weight and age
function getScore(notif) {
  let w = weightMap[notif.Type] || 1; // default to 1 if not found
  
  // calculate how old the notification is in hours
  let timeDiffMs = Date.now() - new Date(notif.Timestamp).getTime();
  let hoursOld = timeDiffMs / (1000 * 60 * 60);
  
  // using exponential decay formula (half life = 12 hrs)
  let decay = Math.pow(0.5, hoursOld / 12);
  
  return w * decay;
}

async function start() {
  try {
    await Log('backend', 'info', 'service', `Priority inbox: top 10 requested`);
    
    // get all notifications from the test server
    const res = await axios.get('http://20.207.122.201/evaluation-service/notifications', {
      headers: { Authorization: `Bearer ${require('./src/config/logger').TOKEN}` }
    });
    let notifications = res.data.notifications;
    
    await Log('backend', 'info', 'handler', `Got ${notifications.length} notifs, scoring`);

    // add score to each notification and sort them
    for (let i = 0; i < notifications.length; i++) {
      notifications[i].score = getScore(notifications[i]);
    }
    
    notifications.sort((a, b) => b.score - a.score);
    
    // slice the top 10
    let top10 = notifications.slice(0, 10);
    
    await Log('backend', 'info', 'service', `Top ${top10.length} selected`);

    console.log(`\n--- Priority Inbox (Top 10) ---\n`);
    for (let i = 0; i < top10.length; i++) {
      let n = top10[i];
      console.log(`${i + 1}. [${n.Type}] ${n.Message}`);
      console.log(`   ID: ${n.ID}`);
      console.log(`   Time: ${n.Timestamp}`);
      console.log(`   Score: ${n.score.toFixed(4)}\n`);
    }

  } catch (e) {
    await Log('backend', 'fatal', 'service', 'Priority inbox failed');
    console.log("Error running priority inbox:", e.message);
  }
}

start();
