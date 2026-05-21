// Shared rules content rendered into the "How to play" dialog on both
// the entry page and the game page. Keep the markup small and readable;
// no headings deeper than h4.

export const rulesHtml = `
<h2>Hangmangle</h2>

<p>A two-team variant of Hangman. Each team thinks of a secret word with the same agreed length — but here's the twist: both teams' secret words must fit the same shared board. As letters are placed and eliminated, your word might no longer fit — at which point your team must, or may strategically choose to, switch to a different word that does. Voice chat (Zoom, etc.) handles the actual back-and-forth; this app tracks the board and lets team members communicate silently.</p>

<p class="rules-callout"><strong>Key mechanic: both teams' words must fit the same board at all times.</strong></p>

<h3>On your team's turn</h3>

<p>You can do one of these things:</p>

<h4>Guess a letter</h4>

<p>Say a letter aloud. The other team responds by placing that letter in one or more slots on the board, or by adding it to the eliminated list. If eliminated, a body part is added to your team's hangperson (there are 10 in total). The turn then switches automatically.</p>

<p>At this point, if your team believes that no word can fit the conditions on the board, you can select <strong>Call bluff</strong>. If the other team can produce a word that fits the board, they win. If not, you win.</p>

<h4>Guess the whole word</h4>

<p>Click <strong>Guess Word</strong> on your side. Declare the other team's word aloud. If they can produce a different valid word matching the current board, they win. If not, you win.</p>

<h3>Changing your word</h3>

<p>At any point — including right after the other team has guessed a letter — your team may secretly change its word, as long as the new word still fits the current board (correct letters in correct slots, no eliminated letters). Each team has a private chat and candidate-words list to coordinate. The on-screen timer is purely informational — there's no time limit — but use it to keep things moving.</p>

<h3>Example</h3>

<p>The board shows <span class="board">H _ N G _ _</span>, and eliminated letters are F, T, and O.</p>

<p>Your team has listed HANGAR, HANGER, HUNGER, HANGED, and HINGED as candidate words that fit the board. Your team decides to guess "R", reasoning:</p>

<ul>
  <li>If R is eliminated, switch to HANGED or HINGED.</li>
  <li>If R lands in the last slot, stick with HANGAR, HANGER, or HUNGER.</li>
</ul>

<p>Either way, the other team probably can't pin you down on their next turn.</p>

<p>But — surprise! — the other team places R in <strong>slot 5</strong>, not slot 6. The board is now <span class="board">H _ N G R _</span>, and <em>none</em> of your candidates fit. Your team panics, then quickly comes up with HUNGRY and HANGRY. Phew — two candidates means the other team still can't win on the next turn.</p>

<h3>Using the app</h3>

<ul>
  <li>Eliminated and Available letters appear in the middle column and are shared by both teams.</li>
  <li>Team chat and Candidate words in each team's column are private to that team.</li>
  <li><strong>Undo</strong> reverts the most recent board action (one level only).</li>
  <li><strong>Start over</strong> clears the board and lets you pick a new word length. Teams stay the same.</li>
  <li><strong>Switch turn</strong> manually flips whose turn it is, if the app and the conversation get out of sync.</li>
  <li><strong>Timer</strong> shows how long the current turn has lasted; resets on every turn change. Pause and Reset as needed.</li>
  <li><strong>Copy link</strong> copies a join URL you can paste to teammates.</li>
</ul>
`;
