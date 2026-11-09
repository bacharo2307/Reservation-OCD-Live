/* OCD LIVE — VoiceProvider. Version actuelle : reconnaissance et synthèse vocales du navigateur
   (Web Speech API), gratuites et sans envoi d'audio à nos serveurs. Un autre fournisseur
   (OpenAI Realtime, ElevenLabs…) peut remplacer cet objet sans toucher au reste de l'application,
   tant qu'il expose les mêmes fonctions. Aucun enregistrement audio n'est conservé. */
(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var synth = window.speechSynthesis;
  var rec = null;
  var voice = null;

  function pickVoice() {
    if (!synth) return;
    var vs = synth.getVoices() || [];
    var fr = vs.filter(function (v) { return /^fr/i.test(v.lang); });
    voice = fr.find(function (v) { return /fr[-_]FR/i.test(v.lang) && /(Denise|Hortense|Julie|Amélie|Audrey|Marie|Google français|Female|femme)/i.test(v.name); })
      || fr.find(function (v) { return /fr[-_]FR/i.test(v.lang); }) || fr[0] || null;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }

  // Débloque la synthèse sur iOS : doit être appelé pendant un geste de l'utilisateur.
  function unlock() {
    if (!synth) return;
    try { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch (e) { /* rien */ }
  }

  function speak(text) {
    return new Promise(function (resolve) {
      if (!synth || !text) return resolve();
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'fr-FR';
      if (voice) u.voice = voice;
      u.rate = 1.03;
      var done = false;
      var finish = function () { if (!done) { done = true; resolve(); } };
      u.onend = finish;
      u.onerror = finish;
      // Sécurité : certains navigateurs n'émettent jamais « onend ».
      setTimeout(finish, Math.min(30000, 2500 + text.length * 90));
      synth.speak(u);
    });
  }

  function stopSpeaking() { if (synth) synth.cancel(); }

  function listen(h) {
    if (!SR) { if (h.onError) h.onError('unsupported'); return; }
    stopListening();
    var final = '';
    rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) final += r[0].transcript; else interim += r[0].transcript;
      }
      if (h.onInterim) h.onInterim((final + ' ' + interim).trim());
    };
    rec.onerror = function (e) { if (h.onError) h.onError(e.error); };
    rec.onend = function () { rec = null; if (h.onEnd) h.onEnd(final.trim()); };
    try { rec.start(); } catch (e) { rec = null; if (h.onError) h.onError('start'); }
  }

  function stopListening() { if (rec) { try { rec.stop(); } catch (e) { /* déjà arrêté */ } } }

  // Demande l'autorisation du micro avant de commencer, puis libère le micro aussitôt.
  function requestMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(true);
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      s.getTracks().forEach(function (t) { t.stop(); });
      return true;
    });
  }

  window.OCDVoice = { name: 'browser', canListen: Boolean(SR), canSpeak: Boolean(synth), unlock: unlock, speak: speak, stopSpeaking: stopSpeaking, listen: listen, stopListening: stopListening, requestMic: requestMic };
})();
