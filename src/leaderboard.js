/**
 * Leaderboard service for DrexelGuessr.
 * Stores and retrieves high scores from Firestore.
 * Uses a "best score per user" approach.
 */
import { db } from './firebase.js';
import {
    collection,
    doc,
    getDoc,
    setDoc,
    getDocs,
    query,
    orderBy,
    limit,
    serverTimestamp,
    startAfter,
} from 'firebase/firestore';

const COLLECTION_ALL_TIME = 'leaderboard';

/**
 * Get the collection name for the daily leaderboard.
 * Resets at midnight EST/EDT.
 */
export function getDailyCollectionName() {
    const today = new Date();
    // Convert current time to EST/EDT date string components
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(today);
    const estYear = parts.find(p => p.type === 'year').value;
    const estMonth = parts.find(p => p.type === 'month').value;
    const estDay = parts.find(p => p.type === 'day').value;

    return `leaderboard_daily_${estYear}-${estMonth}-${estDay}`;
}

/**
 * Get the collection name for the weekly leaderboard (starts on Sunday, ends end of Saturday EST/EDT).
 */
export function getWeeklyCollectionName() {
    const today = new Date();

    // Use formatter to get the current EST/EDT weekday index (0-indexed, where 0=Sun, 6=Sat)
    // There is no numeric option for weekday in Intl.DateTimeFormat, we format the date parts, which Intl provides natively.
    // However, JS Date can't natively convert a specific timezone back into a Date object accurately without manual parsing
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: 'numeric',
        hour12: false
    });

    // Get current EST date parts
    const estParts = dateFormatter.formatToParts(today);
    const estYear = parseInt(estParts.find(p => p.type === 'year').value, 10);
    const estMonth = parseInt(estParts.find(p => p.type === 'month').value, 10) - 1; // 0-indexed
    const estDay = parseInt(estParts.find(p => p.type === 'day').value, 10);

    // Create a Date object representing the current EST midnight (in UTC)
    // This allows us to safely calculate the day of the week since 1970 UTC. 
    // Jan 1, 1970 was a Thursday (4), so we can modulo to find the day of the week for this UTC date:
    const estMidnight = new Date(Date.UTC(estYear, estMonth, estDay));
    const estDayOfWeek = estMidnight.getUTCDay();

    // Subtract the EST day of week to get to the most recent Sunday
    estMidnight.setUTCDate(estMidnight.getUTCDate() - estDayOfWeek);

    const sundayYear = estMidnight.getUTCFullYear();
    const sundayMonth = String(estMidnight.getUTCMonth() + 1).padStart(2, '0');
    const sundayDate = String(estMidnight.getUTCDate()).padStart(2, '0');

    return `leaderboard_weekly_${sundayYear}-${sundayMonth}-${sundayDate}`;
}

/**
 * Calculate milliseconds remaining until the next Daily reset (12:00 AM EST).
 */
export function getTimeUntilDailyReset() {
    const today = new Date();

    // Format to EST/EDT
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour12: false
    });

    const estParts = dateFormatter.formatToParts(today);
    const estYear = parseInt(estParts.find(p => p.type === 'year').value, 10);
    const estMonth = parseInt(estParts.find(p => p.type === 'month').value, 10) - 1;
    const estDay = parseInt(estParts.find(p => p.type === 'day').value, 10);

    // EST Midnight for the *current* day in UTC time, then jump +1 day to get the next reset
    const nextEstMidnight = new Date(Date.UTC(estYear, estMonth, estDay + 1));

    // Convert current time to a raw UTC timestamp using the exact same EST->UTC mapping trick
    // to find the exact difference in milliseconds.
    const estTimeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    const timeParts = estTimeFormatter.formatToParts(today);
    const currH = parseInt(timeParts.find(p => p.type === 'hour').value, 10);
    const currM = parseInt(timeParts.find(p => p.type === 'minute').value, 10);
    const currS = parseInt(timeParts.find(p => p.type === 'second').value, 10);

    const currentEstInUtc = new Date(Date.UTC(estYear, estMonth, estDay, currH, currM, currS));

    return nextEstMidnight.getTime() - currentEstInUtc.getTime();
}

/**
 * Calculate milliseconds remaining until the next Weekly reset (Sunday 12:00 AM EST).
 */
export function getTimeUntilWeeklyReset() {
    const today = new Date();

    const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    const estParts = dateFormatter.formatToParts(today);
    const estYear = parseInt(estParts.find(p => p.type === 'year').value, 10);
    const estMonth = parseInt(estParts.find(p => p.type === 'month').value, 10) - 1;
    const estDay = parseInt(estParts.find(p => p.type === 'day').value, 10);
    const currH = parseInt(estParts.find(p => p.type === 'hour').value, 10);
    const currM = parseInt(estParts.find(p => p.type === 'minute').value, 10);
    const currS = parseInt(estParts.find(p => p.type === 'second').value, 10);

    const currentEstInUtc = new Date(Date.UTC(estYear, estMonth, estDay, currH, currM, currS));

    // Find how many days until the NEXT Sunday
    const estMidnight = new Date(Date.UTC(estYear, estMonth, estDay));
    const estDayOfWeek = estMidnight.getUTCDay();
    const daysUntilNextSunday = 7 - estDayOfWeek;

    const nextSundayMidnight = new Date(Date.UTC(estYear, estMonth, estDay + daysUntilNextSunday));

    return nextSundayMidnight.getTime() - currentEstInUtc.getTime();
}


/**
 * Submit a score. Only keeps the user's highest score.
 * @param {object} user - Firebase auth user
 * @param {number} score - Total game score
 * @param {Array} rounds - Round breakdown data
 */
export async function submitScore(user, score, rounds) {
    try {
        const collectionsToUpdate = [
            { name: COLLECTION_ALL_TIME, period: 'all-time' },
            { name: getWeeklyCollectionName(), period: 'weekly' },
            { name: getDailyCollectionName(), period: 'daily' }
        ];

        let updatedPeriods = [];

        await Promise.all(collectionsToUpdate.map(async ({ name, period }) => {
            const docRef = doc(db, name, user.uid);
            const existing = await getDoc(docRef);

            // Only update if this score is higher than the existing one
            if (existing.exists() && existing.data().score >= score) {
                return;
            }

            await setDoc(docRef, {
                uid: user.uid,
                displayName: user.displayName || 'Anonymous',
                photoURL: user.photoURL || null,
                score,
                rounds: rounds.map((r) => ({
                    round: r.round,
                    locationName: r.location.name,
                    distance: Number.isFinite(r.distance) ? r.distance : -1,
                    score: r.score,
                })),
                timestamp: serverTimestamp(),
            });

            updatedPeriods.push(period);
        }));

        return { updated: updatedPeriods.length > 0, updatedPeriods };
    } catch (err) {
        console.error('Failed to submit score:', err.message);
        throw err;
    }
}

/**
 * Get top scores from the leaderboard.
 * @param {number} max - Number of scores to fetch
 * @param {object} lastVisible - Optional document snapshot to start pagination after
 * @returns {object} Object containing scores array and the last document snapshot
 */
export async function getTopScores(collectionName = COLLECTION_ALL_TIME, max = 10, lastVisible = null) {
    try {
        let q;
        if (lastVisible) {
            q = query(
                collection(db, collectionName),
                orderBy('score', 'desc'),
                startAfter(lastVisible),
                limit(max)
            );
        } else {
            q = query(
                collection(db, collectionName),
                orderBy('score', 'desc'),
                limit(max)
            );
        }
        const snapshot = await getDocs(q);
        const docs = snapshot.docs;
        const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

        return {
            scores: docs.map((doc) => ({ id: doc.id, ...doc.data() })),
            lastDoc
        };
    } catch (err) {
        console.error('Failed to fetch leaderboard for ' + collectionName + ':', err.message);
        throw err;
    }
}
