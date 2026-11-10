# Push did not reach the remote: a banner, not a dialog / 推送去唔到遠端：用橫額唔用對話框

When a push you started cannot reach its remote at all, Desktop Material now
shows a banner with **Try again** instead of stopping you with an error
dialog.

你自己撳嘅推送如果根本連唔到遠端，而家會出一條有「Try again」嘅橫額，唔再彈錯誤對話框
阻住你。

## Behaviour

- The banner says the push from that repository did not reach the remote, that
  your commits are safe on this computer and that nothing was sent.
- **Try again** runs the same push again and closes the banner. The banner can
  also be dismissed.
- It applies only when Git reports that the host could not be reached, the
  push was started by you (not a background task), and the app knows how to
  retry it. Every other push failure, such as a rejected push or a sign-in
  problem, keeps its existing handling.
- If the retry fails for another reason, that failure is reported the usual
  way.

## Accessibility

The message is announced as an alert, the banner stays until it is dismissed
or retried, and both actions are ordinary buttons.

## Verification

`push-did-not-reach-remote-test.tsx` covers the handler and the banner on
Linux. It has not been seen in a running build or against a real unreachable
remote.
