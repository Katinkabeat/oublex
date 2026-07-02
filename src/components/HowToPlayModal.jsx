import { SQModal } from '../../../rae-side-quest/packages/sq-ui'

// How-to-play modal for Oublex. Voice = the game's straight dark-gross profile,
// kept clear and instructional (Raven pass, 2026-07-02). Class mechanics here
// mirror CLASSES in oublexEngine.js; keep them in sync if a class is retuned.
export default function HowToPlayModal({ open, onClose }) {
  return (
    <SQModal open={open} onClose={onClose} title="How to play">
      <div className="space-y-3 text-sm leading-relaxed">
        <p>
          The dungeon takes a new shape every day, and everyone goes down into the
          same one. You get a single run at it. Spell your way through, or you
          don't come back up.
        </p>

        <p>
          Before you enter the dungeon, choose a class. Each one bends a single
          rule of the fight:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Bard:</b> a word with a doubled letter hits for 1.5x.</li>
          <li><b>Mage:</b> a 6-letter word hits 1.5x, a full 7-tile word 2x.</li>
          <li><b>Ranger:</b> a 2-letter word strikes twice.</li>
          <li><b>Cleric:</b> you heal a quarter of the damage you deal.</li>
        </ul>

        <p>
          <b>Strike with words.</b> You get seven tiles. Spell a word to hit the
          thing in front of you, and your damage is the letter values in that
          word, bent by your class. Two-letter words count. If the monster is
          still standing after your hit, it hits back.
        </p>

        <p>
          <b>When the words run out.</b> With nothing left to spell, hurl a single
          tile into the dark as a rune. It does chip damage and gets you a fresh
          tile.
        </p>

        <p>
          <b>Loot between rooms.</b> Clear a room and you grab one of three things:
          a wildcard tile, +20 HP, or a full redraw of your rack. The wildcard
          plays as any letter you want, but it deals no damage of its own.
        </p>

        <p>
          <b>Live or fall.</b> Clear all five rooms to make it out. Drop to 0 HP
          and the run ends where you fell. Whatever damage you dealt still counts,
          even if you fall.
        </p>

        <p>
          <b>The score.</b> The leaderboard ranks by the total damage you deal
          across the run, so overkill is never wasted. Clear the dungeon and your
          run earns a rank: Gravecrawler at the low end, then Gutcutter, then
          Marrow-reaper, and Deathless at the top. Surviving is the floor. Hitting
          harder is the game.
        </p>
      </div>
    </SQModal>
  )
}
