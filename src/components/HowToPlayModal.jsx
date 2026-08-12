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
          <b>The passage splits.</b> Twice on the way down you get a choice: a
          safe door or a risky one. Both show you the monster, its die, and its
          HP before you commit. Safe is the sturdier fight, and risky hits
          harder but guards a better find. What that find actually is stays a
          mystery until the kill.
        </p>

        <p>
          <b>Loot on the kill.</b> Every monster you drop has a chance to leave
          something behind, straight into your satchel. The satchel holds two:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Potion:</b> heals 28 HP the moment you drink it.</li>
          <li><b>Bloodmark:</b> doubles the damage that lands for the rest of the room it's burned in.</li>
          <li><b>Hexbind:</b> chips a monster's counter-die down a size, starting from your next hit.</li>
          <li><b>Poison:</b> coats your next cast, then ticks 3 more hits after that, whatever you spell.</li>
          <li><b>Second Wind:</b> arms a save. The next hit that would kill you leaves you at 1 HP instead.</li>
        </ul>
        <p>
          Use an item whenever you want, or discard one you don't need to make
          room. A find while both slots are full asks you to swap one out or
          leave it behind.
        </p>

        <p>
          <b>Live or fall.</b> Clear all five rooms to make it out. Drop to 0 HP
          and the run ends where you fell. Whatever damage you landed still
          counts, even if you fall.
        </p>

        <p>
          <b>The score.</b> The leaderboard ranks by the damage that actually
          lands. Swinging past a monster's last HP doesn't pad the number, so
          landing the finishing blow clean matters more than overkill. Clear the
          dungeon and your run earns a rank: Gravecrawler at the low end, then
          Gutcutter, then Marrow-reaper, and Deathless at the top. Surviving is
          the floor. Hitting clean is the game.
        </p>
      </div>
    </SQModal>
  )
}
