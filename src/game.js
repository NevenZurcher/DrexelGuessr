/**
 * Game state management for DrexelGuessr.
 */
import { pickRandomLocations } from './locations.js';
import { haversineDistance } from './maps.js';

const ROUNDS_PER_GAME = 5;
const MAX_SCORE_PER_ROUND = 5000;
const DISTANCE_DECAY = 50; // meters — how quickly score drops with distance

export class GameState {
    constructor() {
        this.locations = [];
        this.currentRound = 0;
        this.rounds = [];
        this.totalScore = 0;
        this.totalRounds = ROUNDS_PER_GAME;
    }

    reset() {
        this.locations = pickRandomLocations(ROUNDS_PER_GAME);
        this.currentRound = 0;
        this.rounds = [];
        this.totalScore = 0;
        this.totalRounds = this.locations.length;
    }

    /** Reset with pre-validated locations (used after coverage check) */
    resetWithLocations(validLocations) {
        this.locations = validLocations;
        this.currentRound = 0;
        this.rounds = [];
        this.totalScore = 0;
        this.totalRounds = validLocations.length;
    }

    /** Get the current round's location */
    getCurrentLocation() {
        return this.locations[this.currentRound];
    }

    /** Get current round number (1-indexed for display) */
    getRoundDisplay() {
        return `Round ${this.currentRound + 1} / ${this.totalRounds}`;
    }

    /** Check if this is the last round */
    isLastRound() {
        return this.currentRound >= this.totalRounds - 1;
    }

    /**
     * Submit a guess for the current round.
     * @param {{ lat: number, lng: number }} guessPos
     * @returns {{ distance: number, score: number, location: object }}
     */
    submitGuess(guessPos) {
        const location = this.getCurrentLocation();
        const actualPos = { lat: location.lat, lng: location.lng };

        let distance = Infinity;
        let score = 0;

        if (guessPos) {
            // Calculate distance in meters
            distance = haversineDistance(guessPos, actualPos);
            // Calculate score: exponential decay
            score = Math.round(MAX_SCORE_PER_ROUND * Math.exp(-distance / DISTANCE_DECAY));
        }

        const roundResult = {
            round: this.currentRound + 1,
            location,
            guessPos,
            actualPos,
            distance,
            score,
        };

        this.rounds.push(roundResult);
        this.totalScore += score;

        return roundResult;
    }

    /** Advance to the next round */
    nextRound() {
        this.currentRound++;
    }

    /** Get a performance rating based on total score */
    getRating() {
        const pct = this.totalScore / (MAX_SCORE_PER_ROUND * this.totalRounds);
        if (pct >= 0.95) return { emoji: '🐉', title: 'True Dragon' };
        if (pct >= 0.80) return { emoji: '🎓', title: 'Campus Expert' };
        if (pct >= 0.60) return { emoji: '🗺️', title: 'Solid Explorer' };
        if (pct >= 0.40) return { emoji: '🚶', title: 'Casual Walker' };
        if (pct >= 0.20) return { emoji: '🧭', title: 'Needs a Map' };
        return { emoji: '😅', title: 'Lost Freshman' };
    }
}
