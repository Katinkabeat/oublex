// Oublex bestiary — the monster pools, one per HP tier.
//
// Each day's run seeds one monster per tier and one encounter + kill variant
// per room (see OublexRun.buildRooms), so the dungeon is the same for everyone
// on a given date but rotates day to day. HP and counter-damage are fixed per
// tier (the sim-balanced curve 13/20/26/33/44 · 5/7/9/11/13; retuned 2026-07-02
// to burn off the too-large HP cushion — see scripts/balance-sim.mjs); monsters are a
// narrative skin over it. Voice = Oublex's straight-dark-gross profile (NOT
// Raven's friendly house voice): visceral, sensory, second person, no jokes.
//
// Grossness and scale climb with the tier; tier 5 is boss-grade and its kills
// end with "Run complete." (the engine's final-room signal).

export const TIERS = [
  // ---- Tier 1 · 13 HP · counter 5 — small and revolting ----
  {
    hp: 13, counter: 5,
    monsters: [
      { name: 'Gnashling',
        enc: [
          "You smell it before you see it. The Gnashling comes into the light streaming green mucus from its mouth and ears, and it does not slow down for you.",
          "Something small and wet is breathing hard in the dark. The Gnashling drags itself out, nose running in long ropes, already furious at you.",
          "The Gnashling is barely the size of your boot and twice as angry. It hisses, and a bubble of green swells and pops between its teeth.",
        ],
        kill: [
          "Your word bursts it. It comes apart wet and small, and the smell stays in the room long after it stops moving.",
          "Your word folds it inside out. It deflates in a spray of green and goes still in the mess.",
          "Your word catches it mid-hiss. It pops, soft and final, and slides down the wall it was clinging to.",
        ] },
      { name: 'Sporeling',
        enc: [
          "The Sporeling shuffles forward on soft black roots, its body one bruised mushroom about to split. Every step puffs a little rot into the air you are breathing.",
          "It smells like a cellar that flooded years ago. The Sporeling swells and settles, swells and settles, leaking spores from the cracks in its skin.",
          "A pale growth peels itself off the wall and turns toward you. The Sporeling has no face, just a wet seam down the middle that opens and breathes.",
        ],
        kill: [
          "Your word splits it open and it bursts into a cloud of spores and brown water. Hold your breath until it settles.",
          "Your word caves the cap in. It collapses into wet pulp and keeps steaming on the floor.",
          "Your word ruptures it end to end. Whatever was growing inside spills out and stops moving.",
        ] },
      { name: 'Gutter Tongue',
        enc: [
          "A fat grey tongue as long as your arm drags itself out of a drain, trailing spit. The Gutter Tongue has no eyes, but it tastes the air and finds you.",
          "Something wet slaps the stone behind you. The Gutter Tongue hauls its own weight forward, slick and blind, leaving a shining trail.",
          "It came up out of the dark with no body attached. The Gutter Tongue flexes once, tastes the floor, then turns the way you went.",
        ],
        kill: [
          "Your word splits it down the middle. It curls in on itself and lies still in a spreading pool of its own spit.",
          "Your word severs it clean. The halves twitch, slap the floor once each, and go limp.",
          "Your word burns through the meat of it. It shrivels back toward the drain, too slow, and stops.",
        ] },
      { name: 'Walleye',
        enc: [
          "A single swollen eye the size of a fist scuttles in on thin red legs, weeping yellow down its own side. The Walleye fixes on you and will not blink.",
          "It watches you before it moves. The Walleye drags its bloated bulk closer on twitching legs, the pupil swinging to track every step you take.",
          "Something is staring from low in the dark. The Walleye crawls into the light, the white of it shot through with broken red, leaking as it comes.",
        ],
        kill: [
          "Your word pops it. It bursts in a hot rush of fluid and folds down over its own legs.",
          "Your word goes straight through the pupil. The eye splits, drains, and collapses to a wet rag on the floor.",
          "Your word ruptures it. It deflates with a sigh, weeping the last of itself across the stone.",
        ] },
      { name: 'Carrion Pup',
        enc: [
          "It used to be someone's dog. The Carrion Pup limps in on three working legs, ribs showing through, a cloud of flies moving with it.",
          "You hear the flies first. The Carrion Pup drags its rotted hindquarters into the light, jaw hanging loose, tail still trying to wag.",
          "The smell of it arrives before it does. Half its hide is gone and the rest is crawling, and the Carrion Pup is still happy to see you.",
        ],
        kill: [
          "Your word breaks it apart. It drops in pieces, and the flies lift off it all at once and come looking for you.",
          "Your word puts it down for good this time. It folds onto its side and stops, finally, leaking into the dirt.",
          "Your word caves its ribs in. It exhales something foul, sags, and the flies settle in to work.",
        ] },
      { name: 'The Scab',
        enc: [
          "A sheet of dried blood peels off the wall and drops to the floor with a wet slap. The Scab drags toward you, raw and glistening on the underside.",
          "The wall here is crusted dark and thick. One corner lifts, then the whole Scab tears free, weeping where it was attached.",
          "It pulls away from the stone an inch at a time, the wet red underneath catching the light. The Scab flops once and starts toward you.",
        ],
        kill: [
          "Your word tears it apart. It comes to pieces like wet paper and leaves a smear where it lands.",
          "Your word rips through the soft underside. It curls up, oozing, and goes flat on the floor.",
          "Your word shreds it down the middle. The halves slap down wet and do not move again.",
        ] },
      { name: 'Pusling',
        enc: [
          "It walks on two swollen stumps, its whole body one tight yellow boil ready to go. The Pusling wobbles closer, the skin stretched thin enough to see through.",
          "The Pusling is round, taut, and weeping at the seams. Every step it takes, the surface trembles like it wants to split early.",
          "Something grossly swollen squeezes out of the dark. The Pusling is all pressure and thin skin, leaking a thin yellow thread behind it.",
        ],
        kill: [
          "Your word lances it. It bursts in a thick yellow gout and slumps into the puddle it made.",
          "Your word splits the skin and it lets go all at once, emptying across the floor in front of you. Step back.",
          "Your word punctures it. It collapses inward, drains, and leaves nothing but a slick on the stone.",
        ] },
      { name: 'Finger Knot',
        enc: [
          "A fistful of severed fingers, knuckled together at the stumps, scuttles into the light like a spider. The Finger Knot still has rings on two of them.",
          "The clicking is fingernails on stone. The Finger Knot scrambles out of the dark, a dozen grey digits moving as one, dragging torn knuckles behind.",
          "Something pale and many-legged crests the rubble. The Finger Knot is exactly what it sounds like, bound at the wrists, the cut ends still weeping.",
        ],
        kill: [
          "Your word scatters it. The fingers fly apart and twitch where they land, one or two still crawling.",
          "Your word breaks the knot. The whole bundle comes undone, the pieces drum the floor, and go still.",
          "Your word crushes it flat. The fingers splay out, curl once each, and stop.",
        ] },
      { name: 'Throatworm',
        enc: [
          "A pale worm as thick as your wrist rears up out of a crack, blind end questing toward your face. The Throatworm knows where it wants to go.",
          "It comes up slow and eyeless, tasting the air for breath. The Throatworm leans toward the warmth of your mouth and starts to climb.",
          "Something white and wet unspools from the dark and lifts its blunt head to your height. The Throatworm wants in, and it is patient about it.",
        ],
        kill: [
          "Your word splits it lengthwise. It whips once, sprays, and drops back into the crack it came from.",
          "Your word bursts the head of it. The body keeps writhing a moment, then sags and is still.",
          "Your word cuts it in two. Both halves coil, searching, then slow and stop.",
        ] },
      { name: 'Reekrat',
        enc: [
          "The Reekrat is swollen to the size of a cat and dragging a belly too full to lift. It leaves a wet line behind it and a smell that stays in your throat.",
          "You hear it before you see it, a heavy wet shuffle. The Reekrat hauls its bloated body into the light, fur slick, something moving under the skin.",
          "It is too fat to run and does not need to. The Reekrat waddles closer, gut distended and leaking, teeth bared in a face gone soft with rot.",
        ],
        kill: [
          "Your word splits its belly. It empties across the floor in one heave and the smell rolls over you.",
          "Your word bursts it. The Reekrat goes flat with a wet sound, and whatever was inside spills out and scatters.",
          "Your word caves it in. It drops, deflated, leaking from everywhere at once.",
        ] },
    ],
  },

  // ---- Tier 2 · 20 HP · counter 7 — bigger, meaner ----
  {
    hp: 20, counter: 7,
    monsters: [
      { name: 'Mire Crawler',
        enc: [
          "It comes up out of the black water without a sound, dragging a smell like a drain that was never cleaned. The Mire Crawler leaves everything it touches slick and dark.",
          "The standing water breaks without a ripple and the Mire Crawler is simply there, streaming filth, close enough to touch before you heard it move.",
          "Something long and low slides out of the flooded dark. The Mire Crawler hauls itself onto the stone, weed and rot hanging off it in ropes.",
        ],
        kill: [
          "Your word opens it end to end. It empties across the floor, warm, then slides back down into the water it came from.",
          "The word takes it across the middle and it folds, gushing black, and sinks without a fight.",
          "It comes apart in the word's path and goes back into the flood in pieces, staining the water as it spreads.",
        ] },
      { name: 'Gravebloom',
        enc: [
          "A body sits up out of the soft ground, pale flowers pushing through the holes in it. The Gravebloom turns its sprouting face toward you and the petals open wet.",
          "What you took for a grave shrugs off its dirt and stands. Roots hang from the Gravebloom's wrists, and something blooms where its eyes used to be.",
          "It grew here. The Gravebloom tears its roots out of the earth with a sound like wet cloth and shuffles closer, shedding petals and grave-soil.",
        ],
        kill: [
          "Your word burns through the stalk of it. The whole corpse withers in seconds and folds back into the ground it climbed out of.",
          "The word severs root from body. It drops, the flowers blacken and curl, and the smell of rot and pollen fills the room.",
          "It splits along the stem and spills dirt and sap and old meat across the floor, then lies still and starts, already, to wilt.",
        ] },
      { name: 'Bile Hound',
        enc: [
          "It pads in low with its ribs spread open, something acrid dripping from between them. The Bile Hound retches once, and the floor where it lands begins to smoke.",
          "You hear it gagging before it rounds the corner. The Bile Hound stalks closer, jaw unhinged, a string of yellow bile swinging from its teeth.",
          "The Bile Hound has run itself down to bone and acid. Its sides heave, its mouth works, and whatever comes up eats holes in the stone.",
        ],
        kill: [
          "Your word breaks it open and its own bile pours out through the wound, finishing what you started.",
          "The word puts it down and it vomits one last time as it falls, dissolving into the puddle it made.",
          "It bursts and the acid goes everywhere at once. Mind your boots.",
        ] },
      { name: 'Skinwrack',
        enc: [
          "A figure with no skin walks into the light, every muscle bare and glistening, leaving red prints where its feet press the stone. The Skinwrack does not seem to feel it.",
          "It has been peeled and it is still standing. The Skinwrack flexes, raw and wet, the meat of it twitching with each step toward you.",
          "The Skinwrack comes forward slick and shining, skinless, breathing through exposed teeth. Steam rises off the open muscle in the cold.",
        ],
        kill: [
          "Your word tears through the bare meat and it comes apart easily, with nothing left to hold it together.",
          "The word opens the muscle to the bone. It sags off its own frame and slides to the floor in sheets.",
          "It splits where the word lands and unravels, red and wet, until there is nothing left standing.",
        ] },
      { name: 'The Bloat',
        enc: [
          "A drowned thing waddles in, swollen tight and shining, gas hissing from its split seams. The Bloat sloshes when it moves and you can hear the water still inside it.",
          "It is far too big for the body it used to be. The Bloat staggers closer, distended and grey-green, leaking at the wrists and the lips.",
          "The Bloat fills the doorway with the smell of low tide and worse. Its belly strains, its skin creaks, and it gurgles at you like it wants to speak.",
        ],
        kill: [
          "Your word punctures it and it goes off, releasing days of gas and brown water in one foul rush. Step back and breathe through your sleeve.",
          "The word splits the skin and the pressure does the rest. It deflates across the floor in a flood, and the stench rolls over you.",
          "It bursts wetly and folds in half, emptying everything it had been holding onto the stone.",
        ] },
      { name: 'Nettle Maw',
        enc: [
          "A fleshy stalk rises out of the dark, tipped with a ring of mouth and barbs that drip clear venom. The Nettle Maw sways, tasting for you.",
          "It opens before you see the rest of it, a wet circle of stingers spreading wide. The Nettle Maw leans down off its stalk and reaches.",
          "The Nettle Maw unfolds petal by barbed petal, each one weeping poison. It bends toward your warmth and the stingers stiffen.",
        ],
        kill: [
          "Your word splits the stalk and the maw drops, snapping at nothing, then goes slack in a pool of its own venom.",
          "The word shears the head clean off. It hits the floor still chewing and slowly stops.",
          "It bursts open and the barbs scatter, and the stalk topples, leaking, beside you.",
        ] },
      { name: 'Maggot Nest',
        enc: [
          "A torn carcass drags itself upright, every wound boiling with maggots. The Maggot Nest moves as one heaving mass, and the buzzing of it fills your ears.",
          "It is more grubs than flesh now. The Maggot Nest pours forward inside the shape of whatever it killed, spilling a few writhing handfuls with every step.",
          "The carcass is only a bag for what is inside it. The Maggot Nest splits and reseals as it comes, white and seething, hungry in a thousand small ways.",
        ],
        kill: [
          "Your word bursts the carcass and the maggots go everywhere, a wet white spray that twitches where it lands.",
          "The word tears the nest open and it empties all at once, the grubs scattering across the floor in a living tide.",
          "It comes apart and the mass inside loses its shape, spreading thin and writhing until it slows and stills.",
        ] },
      { name: 'Weeping Widow',
        enc: [
          "She comes on too many joints, hair hanging in wet ropes to the floor, weeping black from her eyes and mouth at once. The Weeping Widow reaches with fingers a hand too long.",
          "The crying reaches you first. The Weeping Widow drags herself out of the dark, face streaming, mouth open in a grief that never stops, hands already grasping.",
          "Her hair moves before she does. The Weeping Widow lifts her ruined face, leaking from every hole in it, and smiles at you through the tears.",
        ],
        kill: [
          "Your word folds her in half. She collapses into her own wet hair and lies still, finally quiet.",
          "The word breaks her apart at the joints. The long fingers curl, the weeping stops, and she comes down in a heap of damp cloth and hair.",
          "She splits where the word strikes and the grief pours out of her all at once, and then there is nothing left to cry.",
        ] },
      { name: 'Tallow Man',
        enc: [
          "A figure of yellow fat lurches in, already melting, leaving hot prints that smoke on the stone. The Tallow Man's face slides slowly off its own skull as it approaches.",
          "It smells like a kitchen fire. The Tallow Man drips and reforms with every step, fat running off its arms and hardening in strings behind it.",
          "The Tallow Man is rendering itself as it walks, sloughing sheets of hot grease. What is left of its face is a smear with eyes.",
        ],
        kill: [
          "Your word caves it in and it slumps into a steaming pool, the last of its shape running out across the floor.",
          "The word splits it and the fat lets go, the whole figure collapsing into a slick of hot tallow.",
          "It folds and melts where the word lands, leaving a smear of grease and a smell that clings to you.",
        ] },
      { name: 'Splithide',
        enc: [
          "It walks with its skin split down the front, holding the edges shut with both hands. The Splithide cannot quite manage it, and the works of it bulge wet through the gap.",
          "Something has come open that should have stayed closed. The Splithide shuffles in, clutching its own seam, the insides of it shifting behind the tear.",
          "The Splithide leaks from the long split in its hide with every step, leaving a trail of itself. It looks at you almost apologetically before it lunges.",
        ],
        kill: [
          "Your word finishes the tear and it comes apart at the seam, spilling everything it was holding in.",
          "The word opens it the rest of the way. The hands let go, the works slide out, and it folds empty to the floor.",
          "It splits wide where the word strikes and unpacks itself across the stone in one wet rush.",
        ] },
    ],
  },

  // ---- Tier 3 · 26 HP · counter 9 — nasty, dangerous ----
  {
    hp: 26, counter: 9,
    monsters: [
      { name: 'Bone Choir',
        enc: [
          "Three skulls strung on the same cord, throats long gone, leaking something black as they hold one wet note. The Bone Choir already knows your name and will not stop singing it.",
          "The note finds you before the light does, low and wet and wrong. The Bone Choir sways into view, three jaws working in time, the sound of them crawling under your skin.",
          "They hang together on a single sinew, three skulls and one voice. The Bone Choir turns all its empty sockets on you and the note climbs.",
        ],
        kill: [
          "Your word splits all three at once. The note breaks into a gurgle, then nothing, and the black runs out of them across the stone.",
          "The word snaps the cord that binds them. The skulls drop and scatter and the song dies one jaw at a time.",
          "It shatters where the word lands, the harmony collapsing into a wet rattle, and the room goes suddenly, terribly silent.",
        ] },
      { name: 'Gallow Knot',
        enc: [
          "A snarl of hanged bodies swings down out of the dark, necks bent wrong, ropes still knotted to nothing. The Gallow Knot gropes for you with a dozen purple hands.",
          "They come down together, tangled at the throat, faces black and swollen. The Gallow Knot drags its own gallows behind it and reaches.",
          "The creaking of rope announces it. The Gallow Knot lurches forward, a clot of broken necks and grasping arms, every face fixed in the same last expression.",
        ],
        kill: [
          "Your word cuts through the whole tangle. The bodies drop loose and lie where they fall, still at last.",
          "The word severs the knot at its heart and the corpses come apart, sliding off each other into a heap of rope and meat.",
          "It unravels where the word strikes, the hanged things spilling away from one another and going finally limp.",
        ] },
      { name: 'Gut Gardener',
        enc: [
          "It kneels in a spread of its own intestines, arranging them with care, and looks up when you enter. The Gut Gardener gathers an armful of itself and rises to meet you.",
          "The floor is laid out in loops of gut, neat as a garden. The Gut Gardener tends them, humming, then turns its split-open belly toward you and beckons.",
          "It has been busy. The Gut Gardener stands in the middle of its work, threads of viscera running from its hands to every corner, and pulls them taut as you approach.",
        ],
        kill: [
          "Your word cuts every thread at once. The gardener collapses into its own harvest and moves no more.",
          "The word opens it from sternum to groin and the rest of it spills out to join the floor. It folds down among its work and stops.",
          "It comes apart where the word strikes, the careful loops snapping back into a tangle, the gardener sprawled and emptied in the center.",
        ] },
      { name: 'The Midwife',
        enc: [
          "A stooped figure steps out of the dark, cradling a wet bundle that twitches against its chest. The Midwife smiles and tilts it toward you, as if to show you something lovely.",
          "It coos to the thing in its arms as it comes. The Midwife is all wrong angles and red hands, and the bundle it carries is moving on its own.",
          "The Midwife has been waiting a long time to deliver. It shuffles closer, hushing the squirming thing it holds, and offers it to you with both ruined hands.",
        ],
        kill: [
          "Your word takes them both. The bundle goes still first, and then the Midwife folds quietly over it and is done.",
          "The word opens her and what she was carrying spills out unfinished. She sinks down around it and the room goes quiet.",
          "She comes apart where the word strikes, still cradling, and the bundle stops its squirming at last.",
        ] },
      { name: 'Ashthroat',
        enc: [
          "A burnt figure walks in trailing smoke, the cracks in its blackened skin glowing orange. The Ashthroat breathes out a gust of embers and the air goes hot and bitter.",
          "It is still burning from the inside. The Ashthroat creaks closer, shedding flakes of itself, its open mouth full of a low red glow.",
          "The smell of cooked meat comes first. The Ashthroat steps into the light, charred and smoldering, and exhales sparks with every breath.",
        ],
        kill: [
          "Your word cracks it open and the fire inside gutters out, the whole figure crumbling to a cooling heap of ash.",
          "The word shatters the burnt shell and it collapses, the embers dying as the pieces scatter and go dark.",
          "It breaks apart where the word lands and the last of its heat leaks out, leaving a black smear and a curl of smoke.",
        ] },
      { name: 'Leechlord',
        enc: [
          "A man-shaped mass of leeches sways into the light, each one swollen tight with blood, the whole of it glistening and shifting. The Leechlord splits a hundred mouths and turns them all toward you.",
          "It holds its shape only barely. The Leechlord comes forward as a crawling crowd, fat black bodies sliding over one another, dripping where they have drunk too much.",
          "The Leechlord smells of warm copper. It reaches with an arm that comes apart into questing, blood-heavy worms, each one looking for a vein.",
        ],
        kill: [
          "Your word bursts the whole mass and it rains blood, the leeches popping one after another across the floor.",
          "The word tears the shape apart and it loses cohesion, the swollen bodies splitting and emptying in a red flood.",
          "It collapses where the word strikes, a thousand fat mouths letting go at once, and the floor runs red around your boots.",
        ] },
      { name: 'Hollow Mother',
        enc: [
          "She opens her chest like a door, and the things nesting inside her shift and chitter at the light. The Hollow Mother beckons you toward the warm dark behind her ribs.",
          "Her torso is a hollow hung with old nests, and something always moving in them. The Hollow Mother spreads her arms wide and invites you in.",
          "The Hollow Mother is empty where it counts, scraped clean and lined with whatever crawled in to live there. She smiles and holds her ribs apart for you.",
        ],
        kill: [
          "Your word closes the door for good. She folds shut over her tenants and they go quiet inside her as she falls.",
          "The word collapses the hollow and everything nesting in her spills out, scattering as she comes down on top of it.",
          "She caves in where the word strikes, ribs and nests and all, and whatever lived inside her does not crawl out.",
        ] },
      { name: 'The Renderer',
        enc: [
          "It wears an apron of stitched faces and carries a hook in each hand. The Renderer steps off its killing floor, unhurried, and sizes you up like a side of meat.",
          "Hooks drag and scrape behind it. The Renderer comes forward in its skin apron, flexing red hands, already deciding where to start on you.",
          "The Renderer has rendered a great many before you. It hefts its hooks, the apron of old faces swaying against its legs, and steps in close.",
        ],
        kill: [
          "Your word buries itself in the butcher and it drops both hooks, then drops after them, gutted by its own trade.",
          "The word opens it like it opened so many others. It sinks to its knees among its tools and falls forward into the mess.",
          "It comes apart where the word strikes, apron and hooks and all, and lies still on the floor it kept so wet.",
        ] },
      { name: 'Spinemarch',
        enc: [
          "A centipede the length of the room pours out of a crack, every segment a human spine, every leg a rib. The Spinemarch clatters toward you, vertebrae clicking like teeth.",
          "It assembles itself out of the dark, spine joined to spine, and begins to march. The Spinemarch raises its front end to your height and the ribs along it rattle.",
          "The clicking is bone on bone, hundreds of joints at once. The Spinemarch surges forward, a river of stolen backbones, a hungry mouth at the head of it.",
        ],
        kill: [
          "Your word snaps it in the middle and the whole march comes undone, vertebrae scattering and spinning across the floor.",
          "The word shatters its spine and it collapses into a heap of loose bone, the legs twitching and then quitting.",
          "It breaks apart where the word strikes, joint by joint, until the last segment stops clicking and lies still.",
        ] },
      { name: 'Weepwood',
        enc: [
          "A dead tree drags its roots free and turns, and the faces pressed into its bark are all weeping red sap. The Weepwood groans toward you, branches grasping, the faces mouthing something you cannot hear.",
          "It bleeds where the bark cracks. The Weepwood shuffles on knotted roots, every burl a screaming face, every limb reaching for you with woody fingers.",
          "The Weepwood has grown through a great many bodies, and they are all still in there, crying out of the grain. It looms closer, leaking sap and worse.",
        ],
        kill: [
          "Your word splits the trunk and the faces fall silent one by one as it comes down in a shower of bark and red sap.",
          "The word cracks it from root to crown. It topples, the weeping faces stilling as the wood goes to pieces around them.",
          "It splinters where the word strikes, and whatever was trapped in the grain finally stops its crying.",
        ] },
    ],
  },

  // ---- Tier 4 · 33 HP · counter 11 — large, overwhelming ----
  {
    hp: 33, counter: 11,
    monsters: [
      { name: 'Rust Ogre',
        enc: [
          "It fills the doorway and weeps orange rust and something browner from every seam. The Rust Ogre moves slowly because it has never had to move fast, and the stink of it reaches you long before its hands do.",
          "The whole room darkens as it leans in. The Rust Ogre drags one corroded fist along the wall, peeling rust in sheets, in no hurry to reach you and certain that it will.",
          "Iron and rot, that is the smell of it. The Rust Ogre straightens to its full height, scraping the ceiling, weeping filth from every joint, and takes one slow step.",
        ],
        kill: [
          "Your word goes through the soft rot under the rust. It comes apart in slow wet pieces and folds down into its own filth.",
          "The word punches a hole clean through it and the whole giant sags, then falls, a long collapse that shakes grit from the ceiling.",
          "It buckles where the word strikes, the rust giving way all at once, and it comes down in a heap of corroded plate and brown sludge.",
        ] },
      { name: 'Gravetide',
        enc: [
          "The floor at the far wall lifts and starts to roll toward you, a slow wave of grave-mud, loose bone, and things half-dissolved. The Gravetide gathers height as it comes.",
          "It is not one body but all of them, churned together and moving. The Gravetide swells up out of the dark, studded with skulls and reaching arms, and breaks toward you.",
          "A wet roar fills the room as the Gravetide rises, a tide of rot and bone curling at its crest. It will be on you in moments and it is taller than you are.",
        ],
        kill: [
          "Your word cuts the wave at its base and it loses its rise, collapsing into a spreading slick of mud and bone that no longer moves.",
          "The word parts the tide and it falls apart mid-roll, slopping down across the floor in a long, settling wash.",
          "It breaks where the word strikes, the whole swell coming down at once, leaving the room ankle-deep in stilled rot.",
        ] },
      { name: 'The Glutton',
        enc: [
          "A vast distended belly hauls itself in on tiny arms, and above it a mouth wide enough to take you whole. The Glutton inhales, and the air and dust of the room bend toward its throat.",
          "It has eaten everything else down here and is still not full. The Glutton lumbers closer, jaw sagging open, gut dragging, breathing the room in toward itself.",
          "The Glutton's hunger arrives before it does, a pull you feel in your chest. It rounds the corner, all mouth and straining belly, and opens wider.",
        ],
        kill: [
          "Your word goes down its throat and stays there. The Glutton seizes, its belly splits, and everything it ever swallowed comes back out at once.",
          "The word ruptures the gut and it deflates in a catastrophe of old meals, the great mouth gaping silent as it folds.",
          "It bursts where the word strikes and empties a lifetime of feeding across the floor, then sinks down into the ruin of itself.",
        ] },
      { name: 'Flensed Colossus',
        enc: [
          "A giant with no skin ducks through the doorway, every muscle bared and steaming, tendons creaking like ship rope. The Flensed Colossus plants one raw foot and the floor shudders.",
          "It towers, red and glistening, too big to have ever worn skin. The Flensed Colossus flexes, and you can watch every fiber of it work as it reaches down for you.",
          "The Flensed Colossus fills the room with the heat and reek of exposed meat. It looms over you, muscle sliding over muscle, and opens a lipless mouth.",
        ],
        kill: [
          "Your word tears through the bare muscle of its leg and the whole giant comes down, a slow red avalanche that floods the floor.",
          "The word opens it to the bone and it sags off its own skeleton, sheets of muscle sliding free as it topples.",
          "It buckles where the word strikes and falls in pieces, the great raw body unraveling across the stone.",
        ] },
      { name: 'Carrion Throne',
        enc: [
          "A hill of dead things shambles in, and seated in the heart of it is a figure that does not move, crowned and watching. The Carrion Throne carries its king toward you on a hundred fused limbs.",
          "It is built of everything that died down here, packed and grown together. The Carrion Throne lurches closer, and the still figure at its center fixes its dry eyes on you.",
          "The Carrion Throne advances as one great mass of knitted corpses, its seated king swaying gently at the top, presiding over your death.",
        ],
        kill: [
          "Your word strikes the throne at its base and the whole mound comes apart, spilling its dead and toppling the king into the ruin.",
          "The word unmakes the binding that holds it and the corpses fall away from one another, the throne and its king collapsing into a field of loose limbs.",
          "It crumbles where the word strikes, the king sliding down through the heap as it comes apart beneath him, and nothing rises again.",
        ] },
      { name: 'Plague Bell',
        enc: [
          "A great swollen bell of grey flesh hangs from the dark and begins, slowly, to swing. The Plague Bell tolls once, and the sound of it sprays a fine sick mist across the room.",
          "It descends ringing, a vast diseased dome of a thing, weeping from its rim. Each toll of the Plague Bell coats the air with something you do not want to breathe.",
          "The Plague Bell swings into the light, immense and rotten, its single deep note shivering the fluid in your own eyes. It tolls again, closer.",
        ],
        kill: [
          "Your word cracks the bell from rim to crown and its note dies in a long sick exhale, the whole mass splitting and sliding down.",
          "The word shatters it mid-toll and the sound stops dead, the swollen flesh bursting and raining its sickness to the floor.",
          "It splits where the word strikes and tolls one last broken note as it comes down, finally, silent.",
        ] },
      { name: 'Tallowfall',
        enc: [
          "A giant of yellow fat staggers in, sloughing sheets of itself that hit the floor and keep steaming. The Tallowfall is melting faster than it can walk, and bone shows through where the grease runs thin.",
          "It comes apart and remakes itself with every step, vast and dripping. The Tallowfall leaves a hot, reeking slick the width of the corridor behind it.",
          "The Tallowfall fills the room with the stench of a rendering vat. It reaches for you with an arm half run to grease, the fat sliding off its bones in ropes.",
        ],
        kill: [
          "Your word caves the giant in and it collapses into a steaming lake of fat, bones surfacing and sinking in the slick.",
          "The word splits it and the tallow lets go all at once, the whole figure pouring out across the floor in a hot flood.",
          "It folds where the word strikes and melts down to nothing but grease and bone, the heat of it rolling over you as it goes.",
        ] },
      { name: 'Maw of Teeth',
        enc: [
          "The corridor ahead is lined floor to ceiling in teeth, and it is breathing. The Maw of Teeth contracts around you, the walls grinding inward, the far end working like a throat.",
          "There is no door, only teeth, rings of them going back into a wet dark that swallows. The Maw of Teeth flexes, and the whole passage draws you a little deeper.",
          "The Maw of Teeth is the room, and the room is hungry. The walls clench, the teeth scrape together, and the throat at the end of it opens wide.",
        ],
        kill: [
          "Your word jams the throat mid-swallow and the whole passage convulses, the teeth shattering inward as it dies around you.",
          "The word tears the gullet open and the corridor goes slack, the rings of teeth loosening, the breathing gone still.",
          "It seizes where the word strikes and the teeth crack and rain down, the living hall collapsing into dead wet meat.",
        ] },
      { name: 'The Stitched',
        enc: [
          "A giant sewn from a dozen bodies lurches in, mismatched limbs swinging, the seams between them weeping. The Stitched turns its several faces toward you and they do not agree on an expression.",
          "Coarse thread holds it together at every join, and the joins leak. The Stitched drags its patchwork bulk closer, hands of different sizes opening and closing.",
          "The Stitched was made, not born, and badly. It shambles forward on legs that do not match, the stitching straining, the wrong parts of it twitching out of time.",
        ],
        kill: [
          "Your word cuts every seam at once and the giant comes apart into the bodies it was made from, each dropping where it hangs.",
          "The word bursts the stitching and it falls to pieces, limbs and torsos sliding off one another into a heap on the floor.",
          "It unravels where the word strikes, thread snapping, parts parting, until nothing of the whole is left standing.",
        ] },
      { name: 'Offalheap',
        enc: [
          "A mountain of guts and slaughterhouse waste heaves itself up and reaches across the room. The Offalheap has no face, only a thousand surfaces, all of them wet, all of them grasping.",
          "It pours itself toward you, a slow landslide of viscera and filth, gathering loose bone and meat as it comes. The Offalheap is taller than the doorway and growing.",
          "The Offalheap rises with a sound like a drain unclogging, a shifting hill of everything thrown away down here. It leans over you and begins to fold down.",
        ],
        kill: [
          "Your word tears through the heart of the heap and it loses its hold on itself, slumping into a wide, spreading ruin of cold offal.",
          "The word cuts it down and the whole mountain comes apart, sloughing across the floor in a tide of guts that finally stops moving.",
          "It collapses where the word strikes, the reaching surfaces going slack, the heap settling into nothing but the waste it was made of.",
        ] },
    ],
  },

  // ---- Tier 5 · 44 HP · counter 13 · BOSS — climactic (kills end the run) ----
  {
    hp: 44, counter: 13,
    monsters: [
      { name: 'The Lexivore',
        enc: [
          "Every mouth on it hangs open and dripping, more than you can count, all of them turned toward you. The Lexivore eats words, and it can smell the ones still in your throat.",
          "The Lexivore unfolds across the whole far wall, a thing made of mouths and patience. It has swallowed every word ever spoken down here, and it has been saving room for yours.",
          "It does not roar. The Lexivore simply opens, mouth within mouth within mouth, and waits for you to spend the only weapon you have so it can eat that too.",
        ],
        kill: [
          "You give it the one word it cannot keep down. Every mouth heaves at once and it turns itself inside out, dying in its own overflow. Run complete.",
          "The word lodges in every throat at once, a thing it cannot swallow and cannot spit. The Lexivore strangles on it, all its mouths closing for the last time. Run complete.",
          "You speak the word it was never meant to taste, and it comes apart from the inside, every mouth screaming silent as it collapses into nothing. Run complete.",
        ] },
      { name: 'The Forgotten',
        enc: [
          "The dark in the deepest room is crowded. The Forgotten is everyone the dungeon ever swallowed and unremembered, pressed into one grey shape, and it has been waiting to add you.",
          "It has no face because it has too many, all of them half-erased. The Forgotten drifts forward, and you feel your own name start to loosen in your mouth as it nears.",
          "The Forgotten is what is left when a place forgets you on purpose. It reaches with a hundred fading hands, and the edges of you begin to blur.",
        ],
        kill: [
          "You say the one word it cannot unmake, your own, out loud, and the Forgotten comes apart, releasing every lost face into the dark at once. Run complete.",
          "The word holds your shape together when nothing else will, and the Forgotten breaks against it, dissolving back into the dark it was made of. Run complete.",
          "You speak, and you are remembered, and the Forgotten cannot stand it. It unravels into the lost it was holding, and they are gone, and so is it. Run complete.",
        ] },
      { name: 'The Maw Below',
        enc: [
          "The floor of the last room is gone. In its place the Maw Below opens, a throat wide as the room and going down forever, and the whole dungeon tilts to feed you in.",
          "This is what every room was leading to. The Maw Below yawns under your feet, ringed in stone teeth, breathing up the smell of everything it has already eaten.",
          "The Maw Below does not come to you. It simply opens, and the ground leans, and you understand that the dungeon was always one long swallow ending here.",
        ],
        kill: [
          "You speak the word into its depths and it catches in the throat of the world. The Maw Below gags, closes, and seals itself shut beneath you. Run complete.",
          "The word goes down and lodges, and the great throat convulses, the stone teeth shattering as it chokes and closes for good. Run complete.",
          "You give the Maw the one thing it cannot stomach, and it heaves shut around the word, the floor knitting back over a mouth that will not open again. Run complete.",
        ] },
      { name: 'The Unmaker',
        enc: [
          "It does not walk in so much as the room agrees it was always there. The Unmaker turns its attention on you, and where it looks, you feel yourself starting to come undone.",
          "The Unmaker has no body of its own. It wears the absence where bodies used to be, and it reaches for the seams of you, the places where you are only held together by habit.",
          "The air thins and the walls forget their edges. The Unmaker arrives as a great quiet wrongness, and it begins, gently, to take you apart at the idea of you.",
        ],
        kill: [
          "You speak the word that insists you exist, and the Unmaker cannot argue with it. It folds out of the world, taking its silence with it. Run complete.",
          "The word is a fact it cannot unwrite, and it breaks on that fact, the great absence collapsing into a smaller and smaller nothing until it is gone. Run complete.",
          "You name yourself in the one word it cannot undo, and the Unmaker comes apart on the saying of it, unmade by the only thing it could not touch. Run complete.",
        ] },
      { name: 'The Choir Eternal',
        enc: [
          "The Bone Choir was a fragment of this. The Choir Eternal fills the final room floor to ceiling, ten thousand skulls in one endless wet chord, and it sings your name in every voice at once.",
          "The note is so vast you feel it in your teeth and your gut. The Choir Eternal rises, a wall of singing dead, every mouth pouring out the same drowning harmony.",
          "The Choir Eternal has been holding this note since the dungeon was dug. It crescendos as you enter, ten thousand throats and one terrible song, and the sound of it wants you to join.",
        ],
        kill: [
          "You speak the one word the song has no note for, and the whole chorus cracks at once, ten thousand voices breaking into silence and dust. Run complete.",
          "The word shears through the chord and the Choir Eternal comes apart skull by skull, the great song collapsing into a long falling rattle. Run complete.",
          "You give it a word it cannot sing, and the harmony shatters from the inside, the endless choir falling silent until nothing is left to carry the note. Run complete.",
        ] },
      { name: 'The Glut',
        enc: [
          "It has eaten the dungeon. The Glut fills the last room, vast and translucent, and pressed against the inside of its skin you can see every monster you killed, still screaming. It opens for you.",
          "The Glut is what was waiting at the bottom of every hunger above it. It heaves closer, and inside its straining gut you recognize the shapes of everything that tried to stop you on the way down.",
          "The Glut swallowed the others when they failed. Now it lumbers forward, immense and full of the dead, its single mouth wide enough to add you to the collection inside.",
        ],
        kill: [
          "You feed it the word that will not go down, and the Glut splits from gullet to gut, spilling everything it ever ate across the floor in one final flood. Run complete.",
          "The word ruptures it and the whole menagerie inside comes loose at once, the Glut deflating into a tide of its own swallowed dead. Run complete.",
          "It bursts where the word strikes, and everything it had taken pours out and lies still, the great belly emptied for the last time. Run complete.",
        ] },
      { name: 'The Rotcrown King',
        enc: [
          "At the bottom of everything sits a king, throned in his own rot, crowned in pale fungus that has grown down through his skull. The Rotcrown King opens his eyes, and the spores of his crown drift toward you.",
          "He has ruled the deep dark a long time and grown into his seat. The Rotcrown King rises with a tearing of root and robe, his crown breathing out a haze of rot, and steps down to meet his last subject.",
          "The Rotcrown King has been dead and reigning longer than the dungeon has had a name. He lifts his fungal head, and the whole room exhales his decay toward you.",
        ],
        kill: [
          "You speak the word no king can command and the Rotcrown comes apart on his throne, crown and skull and reign collapsing into the rot that made him. Run complete.",
          "The word topples him from his seat and he falls to pieces on the way down, the pale crown going dark, the long reign finally ended. Run complete.",
          "He crumbles where the word strikes, throne and king and crown together, the spores settling, the deep dark left without its ruler. Run complete.",
        ] },
      { name: 'The Weeping Dark',
        enc: [
          "The dark in the last room is wet, and it is crying. The Weeping Dark rises off every surface at once, a grief with no body, and begins to fill the room from the floor up.",
          "It weeps from the walls and pools at your feet and keeps rising. The Weeping Dark has no shape to fight, only a sorrow that drowns, climbing your legs as it mourns.",
          "The Weeping Dark is the dungeon's own despair, gone liquid. It seeps from every crack, cold and black and grieving, and the room begins to fill.",
        ],
        kill: [
          "You speak one bright word into the flood and the Weeping Dark recoils from it, draining back into the cracks it rose from, the grief breaking apart. Run complete.",
          "The word cuts a light through the rising black and the Weeping Dark cannot bear it. It falls away from you all at once, sinking back into the stone. Run complete.",
          "You give the dark a word it cannot drown, and it shrinks from the sound, the floodwaters of it retreating until the room is only a room again. Run complete.",
        ] },
      { name: 'Carrion Saint',
        enc: [
          "It descends in a sick halo of its own light, a saint built of bone and offal, hands spread in a blessing you do not want. The Carrion Saint smiles down at you and the air fills with the perfume of rot.",
          "The Carrion Saint hangs in the air at the heart of the room, radiant and wrong, its wounds weeping light. It opens its arms to gather you into its terrible grace.",
          "Something holy died down here and kept being worshipped until it became this. The Carrion Saint drifts forward, haloed in flies, offering you a sainthood of your own.",
        ],
        kill: [
          "You answer its blessing with the one word it cannot sanctify, and the Carrion Saint's halo gutters out, the whole radiant horror falling dark to the floor. Run complete.",
          "The word strips the false light from it and the Saint comes apart, bone and offal and grace together, the halo dying last. Run complete.",
          "You refuse its grace in a single word, and the Carrion Saint unmakes, its light going out, its blessing ending in a rain of rot. Run complete.",
        ] },
      { name: 'The Last Word',
        enc: [
          "At the very bottom waits a silence with a shape. The Last Word is every word that was ever swallowed before it could be said, packed into one screaming absence, and it has been waiting for yours.",
          "The Last Word makes no sound, and the lack of it is deafening. It presses in from every side, a pressure made of all the things the dead never got to say, and it wants you quiet too.",
          "This is what the Lexivore was feeding. The Last Word looms in total silence, vast and starving, every unspoken word in the world held screaming inside it.",
        ],
        kill: [
          "You say the one word it could never swallow, out loud, into the silence, and the Last Word shatters, releasing every held voice at once in a sound that ends the run. Run complete.",
          "The word breaks the silence open and the Last Word cannot hold against it. It comes apart, and all the unspoken words pour out into the dark, finally free. Run complete.",
          "You spend your final word against its silence and the Last Word breaks on the sound, the great absence collapsing as the dungeon, at last, lets you leave. Run complete.",
        ] },
    ],
  },
]
