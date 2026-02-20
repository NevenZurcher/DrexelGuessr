/**
 * Authentication helpers for DrexelGuessr.
 * Uses Firebase Auth with Google Sign-In.
 */
import { auth } from './firebase.js';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
} from 'firebase/auth';

const provider = new GoogleAuthProvider();

/** Detect if running inside a restricted in-app browser */
export function isWebView() {
    const rules = ['Instagram', 'FBAN', 'FBAV', 'Snapchat', 'TikTok'];
    const ua = navigator.userAgent;
    return rules.some((rule) => ua.includes(rule));
}

/** Trigger Google Sign-In popup */
export async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (err) {
        console.error('Google sign-in failed:', err.message);
        throw err;
    }
}

/** Sign up with email and password */
export async function signUpWithEmail(email, password, displayName) {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
            await updateProfile(result.user, { displayName });
        }
        return result.user;
    } catch (err) {
        console.error('Email sign-up failed:', err.message);
        throw err;
    }
}

/** Sign in with email and password */
export async function signInWithEmail(email, password) {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return result.user;
    } catch (err) {
        console.error('Email sign-in failed:', err.message);
        throw err;
    }
}

/** Sign out the current user */
export async function signOutUser() {
    try {
        await signOut(auth);
    } catch (err) {
        console.error('Sign-out failed:', err.message);
        throw err;
    }
}

/** Listen for auth state changes */
export function onAuthChange(callback) {
    return onAuthStateChanged(auth, callback);
}

/** Get the currently signed-in user (or null) */
export function getCurrentUser() {
    return auth.currentUser;
}
