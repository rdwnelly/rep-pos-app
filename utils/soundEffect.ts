export const playBeep = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        // Connect oscillator to gain node, and gain node to destination
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Sound characteristics (A short, crisp beep)
        oscillator.type = 'sine'; // 'sine', 'square', 'sawtooth', 'triangle'
        oscillator.frequency.setValueAtTime(800, ctx.currentTime); // 800 Hz
        
        // Volume envelope for a crisp sound without clicking
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01); // Quick attack
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); // Quick release

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
    } catch (e) {
        console.log("AudioContext not supported or blocked by browser.");
    }
};
