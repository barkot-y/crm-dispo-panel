// ==UserScript==
// @name         CRM Live Caption & Dispo Assist
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Globally injected CRM panel with real-time captions, draggable capabilities, and matching rules
// @author       barkot
// @match       *://69.10.47.54/*
// @grant         GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 1. KNOWLEDGE BASE (Updated for 2026)
    const REBUTTALS_DB = {
        thirdParty: {
            whatIsThis: "My name is (Agent Name). I'm calling on behalf of (SH Last Name) investment with (Job Name) regarding an upcoming meeting. Is he/she available? May I please leave a message?",
            financialMatters: "Are you stating that you are authorized to vote on behalf of the shareholder? [If YES]: For the record, please state your FULL NAME. [If NO]: I'm sorry, but I can only discuss that with the shareholder or their authorized representative.",
            wrongNumber: "My apologies, I'm trying to reach (SH Name) at (City, State and ZIP Code). Do you recognize this name and address?",
            deceased: "My condolences and I'm sorry for your loss, is there any way I can please speak with the EXECUTOR of the shareholder's Estate?",
            incapacitated: "May I please speak with the POWER OF ATTORNEY, or the person handling their accounts? Is there a better number to reach them at?"
        },
        skeptical: {
            isSalesCall: "This is not a sales call - it is about an investment in <JOB NAME>. We are only calling to advise you of the upcoming shareholder's meeting and to offer you the convenience of casting your vote over the phone.",
            whyRecorded: "All calls are recorded for quality control purposes. Once we were retained to contact you about the shareholder meeting, we used publicly available sources to find the best number to reach you.",
            numberBlocked: "Our dialing system currently does not allow an outbound phone number to be displayed. I would be happy to give you our toll-free number for you to call us back.",
            neverCalled: "I understand your concern, we know many shareholders may not have the time to review the proxy materials or vote by mail. We're calling to offer you the convenience of voting by phone.",
            whoDoYouWorkFor: "I am with Alliance Advisors, a proxy information firm, retained by <JOB NAME> to contact shareholders about the upcoming meeting.",
            dontOwnShares: "Our records indicate that you are currently a shareholder of <JOB NAME>, and you reside in [CITY/STATE/ZIP]. Is this correct? ... I apologize for the inconvenience. Your participation is important."
        },
        voting: {
            whyVote: "We want to ensure that all shares are represented at the upcoming meeting. If the meeting is adjourned, it will have to be rescheduled and the materials re-mailed. Your board has recommended you vote 'FOR'...",
            alreadyVoted: "Currently, your vote is not recorded in the system. I'd be happy to reconfirm your vote now so that it will be recorded immediately, and send you a written confirmation.",
            voteOnline: "That's fine. Keep in mind that the materials contain a CONTROL NUMBER that you will need to cast your vote online. Or, I can record your vote right now so it is accounted for.",
            abstain: "Would you like to cast an abstain vote, or would you prefer not to vote at all? I understand, just remember, your vote is important, and it helps the company reach quorum.",
            soldShares: "I understand. However, as of the record date, you were still a shareholder and are still eligible to take part in the upcoming shareholder's meeting.",
            recordDate: "It is the date set by the Company/Fund-a cut-off date-on which a shareholder must be recorded as an owner of shares to be eligible to vote."
        },
        confirming: {
            howManyAccounts: "Currently, our system shows [#account(s)], but depending on how the account is registered all accounts may not be grouped.",
            allAccounts: "This means you would like to vote all of your accounts with this Company/Fund only, in the same manner (for/against/abstain).",
            noWrittenConfirmation: "The confirmations are automatically generated and sent to the address on record.",
            updateAddress: "I understand, for that you will have to contact your broker or Financial Advisor to update name/address."
        },
        undecided: {
            howToVote: "I am not authorized to advise you on how to vote, but I can tell you that your board recommends you vote 'FOR' the proposals.",
            haventDecided: "I would be happy to review the meeting agenda with you right now. It will only take a few moments...",
            callMeBack: "Of course. You can also call us back at our toll-free number when you are ready to cast your vote by phone. Or we can email you the material within 24 hours.",
            brokerHandles: "I understand that your broker or financial advisor handles your investment, however, I can help you cast your vote right now to help the company reach quorum."
        }
    };

    // 2. BUILD THE DRAGGABLE UI
    function createDispoPanel() {
        if (document.getElementById('crm-tamper-layout')) return;

        const layout = document.createElement('div');
        layout.id = 'crm-tamper-layout';
        layout.style.cssText = 'position:fixed; bottom:20px; right:20px; width:380px; background:#fff; border:2px solid #333; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.15); font-family:system-ui,sans-serif; z-index:999999; overflow:hidden;';

        layout.innerHTML = `
          <div id="crm-drag-header" style="background:#333; color:#fff; padding:12px; font-weight:bold; display:flex; justify-content:space-between; cursor:grab; user-select:none;">
            <span>🎙️ Verma CRM Assistant</span>
            <button id="start-mic-btn" style="background:#dc3545; color:white; border:none; padding:2px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Start Mic OFF</button>
          </div>
          <div style="padding:15px;">
            <label style="font-size:11px; text-transform:uppercase; color:#666; font-weight:bold; display:block; margin-bottom:4px;">Live Audio Feed</label>
            <div id="live-caption-box" style="background:#f4f4f7; border:1px solid #ddd; padding:10px; border-radius:6px; min-height:50px; max-height:80px; overflow-y:auto; font-size:13px; color:#222; line-height:1.4; margin-bottom:15px;">
              Waiting for mic connection...
            </div>

            <label style="font-size:11px; text-transform:uppercase; color:#0056b3; font-weight:bold; display:block; margin-bottom:4px;">Suggested Rebuttal</label>
            <div id="ai-rebuttal-box" style="background:#e8f4ff; border:1px solid #b8daff; padding:10px; border-radius:6px; min-height:80px; font-size:13px; color:#004085; line-height:1.4;">
              Awaiting trigger keywords...
            </div>
          </div>
        `;
        document.body.appendChild(layout);

        makeElementDraggable(layout, document.getElementById('crm-drag-header'));
        setupSpeechRecognition();
    }

    // 3. DRAG LOGIC
    function makeElementDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = (e) => {
            if(e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
            document.onmousemove = (e) => {
                e.preventDefault();
                pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                pos3 = e.clientX; pos4 = e.clientY;
                element.style.bottom = "auto"; element.style.right = "auto";
                element.style.top = (element.offsetTop - pos2) + "px"; element.style.left = (element.offsetLeft - pos1) + "px";
            };
        };
    }

    // 4. BUILT-IN BROWSER SPEECH RECOGNITION (AUTO-START LOGIC)
    function setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            document.getElementById('live-caption-box').innerText = "Speech Recognition not supported in this browser.";
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let isListening = false;
        const micBtn = document.getElementById('start-mic-btn');
        const captionBox = document.getElementById('live-caption-box');
        const autoStartMemory = sessionStorage.getItem('verma_mic_auto_start') === 'true';

        function activateMic() {
            try {
                recognition.start();
                isListening = true;
                micBtn.innerText = "Listening ON";
                micBtn.style.background = "#28a745";
                captionBox.innerText = "Listening...";
                sessionStorage.setItem('verma_mic_auto_start', 'true');
            } catch (err) {}
        }

        function deactivateMic() {
            recognition.stop();
            isListening = false;
            micBtn.innerText = "Start Mic OFF";
            micBtn.style.background = "#dc3545";
            sessionStorage.setItem('verma_mic_auto_start', 'false');
        }

        micBtn.addEventListener('click', () => {
            if (isListening) deactivateMic();
            else activateMic();
        });

        if (autoStartMemory) {
            setTimeout(() => { activateMic(); }, 500);
        }

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                captionBox.innerText = finalTranscript;
                captionBox.scrollTop = captionBox.scrollHeight;
                matchVoiceToRebuttal(finalTranscript);
            }
        };

        recognition.onend = () => {
            if (isListening) {
                try { recognition.start(); } catch(e) {}
            }
        };

        recognition.onerror = (event) => {
            if (event.error === 'not-allowed') {
                captionBox.innerText = "Microphone access blocked! Edge requires a manual click to allow audio.";
                deactivateMic();
            }
        };
    }

    // 5. ADVANCED DYNAMIC MATCHING ENGINE
    function matchVoiceToRebuttal(text) {
        const lowerText = text.toLowerCase();
        const rebuttalBox = document.getElementById('ai-rebuttal-box');
        if (!rebuttalBox) return;

        // The master map of all combinations and synonyms
        const triggerMap = [
            // THIRD PARTY & UNCONFIRMED
            { keywords: ["what is this about", "why are you calling", "what is this regarding", "who is this", "not available", "not here right now", "not home", "take a message", "unavailable", "step away", "who are you looking for"], rebuttal: REBUTTALS_DB.thirdParty.whatIsThis },
            { keywords: ["handle financial", "handle finances", "handle her money", "handle his money", "how many shares", "account specifics", "husband", "wife", "spouse", "can i vote for", "vote on their behalf", "power of attorney"], rebuttal: REBUTTALS_DB.thirdParty.financialMatters },
            { keywords: ["wrong number", "no one by that name", "nobody by that name", "wrong person", "wrong dial"], rebuttal: REBUTTALS_DB.thirdParty.wrongNumber },
            { keywords: ["deceased", "passed away", "died", "is dead", "passed on", "no longer with us"], rebuttal: REBUTTALS_DB.thirdParty.deceased },
            { keywords: ["incapacitated", "military", "nursing home", "hospital", "does not live here", "moved away", "different address", "doesn't live here"], rebuttal: REBUTTALS_DB.thirdParty.incapacitated },

            // SKEPTICAL
            { keywords: ["sales call", "telemarketer", "soliciting", "trying to sell", "selling something"], rebuttal: REBUTTALS_DB.skeptical.isSalesCall },
            { keywords: ["why is this recorded", "why are you recording", "get my phone number", "get my number", "where did you get", "who gave you my number"], rebuttal: REBUTTALS_DB.skeptical.whyRecorded },
            { keywords: ["number blocked", "spam risk", "caller id", "unknown number", "private number", "why is your number"], rebuttal: REBUTTALS_DB.skeptical.numberBlocked },
            { keywords: ["never been called", "never called me before", "first time", "never received a call", "never got a call"], rebuttal: REBUTTALS_DB.skeptical.neverCalled },
            { keywords: ["who do you work for", "what company is this", "where are you calling from", "who are you with"], rebuttal: REBUTTALS_DB.skeptical.whoDoYouWorkFor },
            { keywords: ["don't own shares", "don't have an investment", "not a shareholder", "keep calling me", "why do you keep calling", "stop calling"], rebuttal: REBUTTALS_DB.skeptical.dontOwnShares },

            // VOTING
            { keywords: ["why do i need to vote", "why should i vote", "do i have to vote", "what happens if i don't", "why does it matter"], rebuttal: REBUTTALS_DB.voting.whyVote },
            { keywords: ["already voted", "sent in", "mailed it", "already sent my proxy", "done this already", "already sent"], rebuttal: REBUTTALS_DB.voting.alreadyVoted },
            { keywords: ["vote online", "internet", "use the web", "online voting", "do it online"], rebuttal: REBUTTALS_DB.voting.voteOnline },
            { keywords: ["abstain", "will not vote", "not interested", "refuse to vote", "don't want to vote", "not voting", "don't care"], rebuttal: REBUTTALS_DB.voting.abstain },
            { keywords: ["sold my shares", "already sold", "don't own them anymore", "cashed out"], rebuttal: REBUTTALS_DB.voting.soldShares },

            // CONFIRMING
            { keywords: ["how many accounts", "how many do i have", "multiple accounts"], rebuttal: REBUTTALS_DB.confirming.howManyAccounts },
            { keywords: ["all accounts accordingly", "what does accordingly mean", "what does that mean"], rebuttal: REBUTTALS_DB.confirming.allAccounts },
            { keywords: ["written confirmation", "don't need you to send", "don't mail me", "save the paper"], rebuttal: REBUTTALS_DB.confirming.noWrittenConfirmation },
            { keywords: ["update the address", "update address", "wrong address", "change my name", "new address", "moved to", "update my info"], rebuttal: REBUTTALS_DB.confirming.updateAddress },

            // UNDECIDED & CALLBACKS
            { keywords: ["suggest i vote", "how should i vote", "what do you recommend", "board recommendation", "board suggest"], rebuttal: REBUTTALS_DB.undecided.howToVote },
            { keywords: ["haven't decided", "don't know yet", "still thinking", "need more time", "need to look at it"], rebuttal: REBUTTALS_DB.undecided.haventDecided },
            { keywords: ["call me back", "call back later", "not received", "didn't get the material", "remail", "send it again", "mail it to me"], rebuttal: REBUTTALS_DB.undecided.callMeBack },
            { keywords: ["broker", "financial advisor", "financial planner", "wealth manager", "guy handles it", "let my broker"], rebuttal: REBUTTALS_DB.undecided.brokerHandles }
        ];

        // Search the map for any matching keyword
        const match = triggerMap.find(mapping =>
            mapping.keywords.some(keyword => lowerText.includes(keyword))
        );

        if (match) {
            rebuttalBox.innerText = match.rebuttal;
        } else if (text.trim() !== "") {
            // Keep the previous suggestion if they keep talking but don't trigger a new one immediately
            // Or show listening state if empty
        }
    }

    createDispoPanel();
})();
