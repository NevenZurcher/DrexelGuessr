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
} from 'firebase/firestore';

const COLLECTION = 'leaderboard';

/**
 * Submit a score. Only keeps the user's highest score.
 * @param {object} user - Firebase auth user
 * @param {number} score - Total game score
 * @param {Array} rounds - Round breakdown data
 */
export async function submitScore(user, score, rounds) {
    try {
        const docRef = doc(db, COLLECTION, user.uid);
        const existing = await getDoc(docRef);

        // Only update if this score is higher than the existing one
        if (existing.exists() && existing.data().score >= score) {
            return { updated: false, previousBest: existing.data().score };
        }

        await setDoc(docRef, {
            uid: user.uid,
            displayName: user.displayName || 'Anonymous',
            photoURL: user.photoURL || null,
            score,
            rounds: rounds.map((r) => ({
                round: r.round,
                locationName: r.location.name,
                distance: r.distance,
                score: r.score,
            })),
            timestamp: new Date().toISOString(),
        });

        return { updated: true };
    } catch (err) {
        console.error('Failed to submit score:', err.message);
        throw err;
    }
}

/**
 * Get top scores from the leaderboard.
 * @param {number} max - Number of scores to fetch
 * @returns {Array<object>} Sorted array of score entries
 */
export async function getTopScores(max = 10) {
    try {
        const q = query(
            collection(db, COLLECTION),
            orderBy('score', 'desc'),
            limit(max)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
        console.error('Failed to fetch leaderboard:', err.message);
        throw err;
    }
}
