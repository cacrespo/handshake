# Learning 02: Sovereign Identity with Ed25519

In traditional social networks, your identity belongs to a central server. In **Strata**, you are the sole owner of your identity through public-key cryptography.

## 1. What is Ed25519?
It is a **Digital Signature** algorithm based on Edwards-curve Digital Signature Algorithm (EdDSA). It is extremely fast, secure, and generates small keys (32 bytes), which is perfect for mobile devices.

## 2. The Concept: Private Key vs. Public Key

Think of a physical stamp and its impression:
*   **Private Key (Secret):** Your unique, secret "stamp." It never leaves your device. You use it to "sign" messages.
*   **Public Key (Your ID):** The impression the stamp leaves. This is your public identifier.

## 3. How it works in Strata

1.  **Signing:** When you write a message, the system takes the text and your *Private Key* to generate a unique **Signature**.
2.  **Message:** The message travels through the P2P network carrying the content + your Public Key + the Signature.
3.  **Verification:** When another user receives the message, they use your *Public Key* to verify the signature. 
    *   If the text was changed by even a single character, the signature becomes invalid.
    *   It is mathematically impossible to forge this signature without the private key.

## 4. Why this matters?
*   **No Central Database:** We don't need a `users` table. A user "exists" because their signature is valid.
*   **Total Sovereignty:** No one can impersonate you, and no one can take your identity away as long as you keep your private key safe.

---
*Code Reference:* Check `src/strata/core/models.py` to see `private_key.sign()` and `public_key.verify()` in action.
