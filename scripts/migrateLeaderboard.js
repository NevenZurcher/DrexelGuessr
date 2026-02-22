import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf-8'));

// 1. Initialize Firebase Admin
initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

// 2. Helper functions for Collection Names (Ported from frontend logic)
function getDailyCollectionName(date) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const estYear = parts.find(p => p.type === 'year').value;
    const estMonth = parts.find(p => p.type === 'month').value;
    const estDay = parts.find(p => p.type === 'day').value;

    return `leaderboard_daily_${estYear}-${estMonth}-${estDay}`;
}

function getWeeklyCollectionName(date) {
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    const estParts = dateFormatter.formatToParts(date);
    const estYear = parseInt(estParts.find(p => p.type === 'year').value, 10);
    const estMonth = parseInt(estParts.find(p => p.type === 'month').value, 10) - 1;
    const estDay = parseInt(estParts.find(p => p.type === 'day').value, 10);

    const estMidnight = new Date(Date.UTC(estYear, estMonth, estDay));
    const estDayOfWeek = estMidnight.getUTCDay();

    estMidnight.setUTCDate(estMidnight.getUTCDate() - estDayOfWeek);

    const sundayYear = estMidnight.getUTCFullYear();
    const sundayMonth = String(estMidnight.getUTCMonth() + 1).padStart(2, '0');
    const sundayDate = String(estMidnight.getUTCDate()).padStart(2, '0');

    return `leaderboard_weekly_${sundayYear}-${sundayMonth}-${sundayDate}`;
}

// 3. Migration Logic
async function runMigration() {
    console.log("Starting Leaderboard backfill migration...");
    const leaderboardRef = db.collection('leaderboard');
    const snapshot = await leaderboardRef.get();

    if (snapshot.empty) {
        console.log('No existing leaderboard scores to migrate.');
        return;
    }

    let processed = 0;

    // Batch operations for efficiency and to avoid rate limits
    const batch = db.batch();

    for (const doc of snapshot.docs) {
        const data = doc.data();

        // Skip if there's no timestamp to calculate the period from
        if (!data.timestamp) {
            console.warn(`Skipping user ${data.uid} - no timestamp found.`);
            continue;
        }

        // Convert Firestore Timestamp to JS Date
        const scoreDate = data.timestamp.toDate();

        // Determine correct collection names
        const dailyCollectionName = getDailyCollectionName(scoreDate);
        const weeklyCollectionName = getWeeklyCollectionName(scoreDate);

        // Daily Ref
        const dailyRef = db.collection(dailyCollectionName).doc(data.uid);
        batch.set(dailyRef, data, { merge: true }); // Merge true keeps the highest score if we run this multiple times

        // Weekly Ref
        const weeklyRef = db.collection(weeklyCollectionName).doc(data.uid);
        batch.set(weeklyRef, data, { merge: true });

        processed++;
    }

    await batch.commit();
    console.log(`Successfully completed migration! Backfilled ${processed} records into their respective daily and weekly collections.`);
}

runMigration().catch(console.error);
