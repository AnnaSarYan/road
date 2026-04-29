import { setTimeout as wait } from "timers/promises";
import { createHmac } from "crypto";
import { createTransport } from "nodemailer";

const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1laWQiOiJlNWNjNDYxYi0yNDM3LTQ2NzYtODFiOC1kYmRhZDU5OWYxMDA6QUZBOUFBRDE3MjhCNEI1NzlGMzVGRTRGMTQ3MjQ5MEMiLCJqdGkiOiJmYTkyM2EyOC01ZTU4LTQ3OWQtOTZiYi0zZDAzYTUzZWE1OWIiLCJuYmYiOjE3Nzc0NjQyNjcsImV4cCI6MTgwOTAwMDI2NywiaWF0IjoxNzc3NDY0MjY3fQ.g641LLUxW8xk2Mse-AfbdQ1cMqbRELl17OlkpW2jNrk";
const hmacSecret = "Wm1kR2JHUXlZV0ZqYUdGelpTNWpiMjB3TURJeE1URT0=";
const maxDate = new Date("8/24/2026").getTime();

const emailTo = "annasargsyan527.527@gmail.com";
const mailer = createTransport({
  service: "gmail",
  auth: {
    user: emailTo,
    pass: "sqhh uttn vqqq dams",
  },
});

const ntfyTopic = "slotseeker-anna";

async function sendEmail(subject: string, text: string) {
  try {
    await mailer.sendMail({
      from: emailTo,
      to: emailTo,
      subject,
      text,
    });
    console.log("Email sent!");
  } catch (err) {
    console.error("Failed to send email:", err);
  }
}

async function sendPush(title: string, message: string) {
  try {
    await fetch(`https://ntfy.sh/${ntfyTopic}`, {
      method: "POST",
      headers: { Title: title, Priority: "urgent", Tags: "calendar" },
      body: message,
    });
    console.log("Push sent!");
  } catch (err) {
    console.error("Failed to send push:", err);
  }
}

function signRequest(
  method: string,
  path: string,
  timestamp: string,
  params: Record<string, string>,
): string {
  const sorted = Object.entries(params)
    .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const message = method + path + timestamp + sorted;
  return createHmac("sha256", hmacSecret).update(message).digest("base64");
}

// Check only for these branches
const Branches = {
  Yerevan: "2036",
  // Ararat: "2047",
};

interface TimeSlot {
  value: string; // '15:30';
  label: string; // '15:30';
}

interface DaySlots {
  [key: string]: TimeSlot[]; // '2026-02-16T00:00:00': [TimeSlot, TimeSlot, ...]
}

const sent = new Set<number>();

async function get(time: number, branchId: string) {
  const path = "/earlyone/api/AppointmentTimeSlot/GetNearestDay";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = {
    Date: new Date(time).toISOString().split(".")[0],
    AccountId: "0",
    BranchId: branchId,
    CompanyId: "379",
    ServiceId: "300692",
  };
  const signature = signRequest("GET", path, timestamp, params);

  const myHeaders = new Headers();
  myHeaders.append("Host", "e1-api.earlyone.com");
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("Cache-Control", "no-cache");
  myHeaders.append(
    "User-Agent",
    "earlyone/4 CFNetwork/3860.500.112 Darwin/25.4.0",
  );
  myHeaders.append("Accept", "*/*");
  myHeaders.append("Accept-Language", "en-GB,en-US;q=0.9,en;q=0.8");
  myHeaders.append("Accept-Encoding", "gzip, deflate, br");
  myHeaders.append("X-Culture", "en");
  myHeaders.append("X-Timestamp", timestamp);
  myHeaders.append("X-Signature", signature);
  myHeaders.append("Authorization", `Bearer ${token}`);
  myHeaders.append("AppVersion", "5.0.0(4)");

  const requestOptions: RequestInit = {
    method: "GET",
    headers: myHeaders,
    redirect: "follow",
  };

  const endpoint = "https://e1-api.earlyone.com" + path;
  const url = new URL(endpoint);
  url.search = new URLSearchParams(params).toString();

  const res = await fetch(url, requestOptions);

  if (!res.ok) {
    const msg = await res.text().catch(() => null);
    throw new Error(`HTTP error! status: ${res.status}, message: ${msg}`);
  }

  const data = await res.json();

  if (!data || typeof data !== "object") {
    throw new Error("Invalid JSON response");
  }

  return data as DaySlots;
}

function getNearestTime(daySlots: DaySlots): number | undefined {
  const nearestDay = Object.keys(daySlots)
    .map((dateStr) => ({ date: new Date(dateStr), dateStr }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .shift();

  if (!nearestDay) {
    return undefined;
  }

  const timeSlots = daySlots[nearestDay.dateStr];

  if (!timeSlots || timeSlots.length === 0) {
    return undefined;
  }

  const nearestTimeSlot = timeSlots
    .map((slot) => {
      const [hours, minutes] = slot.value.split(":").map(Number);
      const dateTime = new Date(nearestDay.date);
      dateTime.setHours(hours, minutes, 0, 0);
      return dateTime.getTime();
    })
    .sort((a, b) => a - b)
    .shift();

  if (!nearestTimeSlot) {
    return undefined;
  }

  return nearestTimeSlot;
}

async function start() {
  let attempt = 0;
  while (true) {
    for (const [branchName, branchId] of Object.entries(Branches)) {
      try {
        attempt++;

        process.stdout.write(
          `\r- Attempt ${attempt}: Checking ${branchName}... ${" ".repeat(30)}`,
        );
        const now = Date.now();
        const slots = await get(now, branchId);
        const nearestTime = getNearestTime(slots);
        const notified = nearestTime && sent.has(nearestTime);

        if (nearestTime && nearestTime < maxDate && !notified) {
          console.log("-------------------------------");
          console.log("-------------------------------");
          console.log("-------------------------------");
          console.log("-------------------------------");
          console.log(
            `Found ${branchName}: ${new Date(nearestTime).toLocaleString()}`,
          );
          console.log("-------------------------------");
          console.log("-------------------------------");
          console.log("-------------------------------");

          const dateStr = new Date(nearestTime).toLocaleString();
          await sendEmail(
            `EarlyOne: Available date ${dateStr} in ${branchName}`,
            `Available date: ${dateStr}\nBranch: ${branchName}`,
          );
          await sendPush(`Available date in ${branchName}`, `Date: ${dateStr}`);
          sent.add(nearestTime);
        } else {
          process.stdout.write(
            `\r${branchName} nearest was ${
              nearestTime ? new Date(nearestTime).toDateString() : "N/A"
            }. ${" ".repeat(50)}\n`,
          );
        }
      } catch (err) {
        console.error(err);
      }

      await wait(5000); // 5 seconds between branches
    }

    process.stdout.write(`\rWaiting... ${" ".repeat(50)}`);
    await wait(60000); // 1 minute between checks
  }
}

start();
