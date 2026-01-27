import { useAuth } from '@/contexts/AuthContext';
import { CURRENT_YEAR, getEventMatches, getMatchTeam, getTeamPhoto } from '@/lib/blueAlliance';
import { getEvents, getMatch } from '@/lib/matches';
import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { prettifyRole } from './Dashboard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsTrigger, TabsList } from '@radix-ui/react-tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu';
import { Input } from '@/components/ui/input';
import { set } from 'date-fns';

export default function ScoutConfig() {
    const { match_id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();
    var currentEvent;
    
    const [matchType, setMatchType] = useState('Qualification');
    const [matchNumber, setMatchNumber] = useState(0);
    const [teamNumber, setTeamNumber] = useState(0);

    const [role, setRole] = useState('');
    const [loadingPhoto, setLoadingPhoto] = useState(false);
    const [teamPhoto, setTeamPhoto] = useState<string | null>(null);
    const [teamNumbers, setTeamNumbers] = useState<Record<string, number | null>>(
      {}
    );

    useEffect(() => {
        const loadMatchData = async () => {
            const match = await getMatch(match_id);
            let match_role = '';
            switch (user?.id) {
                case match?.blue1_scouter_id:
                    match_role = 'blue1'; break;
                case match?.blue2_scouter_id:
                    match_role = 'blue2'; break;
                case match?.blue3_scouter_id:
                    match_role = 'blue3'; break;
                case match?.qual_blue_scouter_id:
                    match_role = 'qualBlue'; break;
                case match?.red1_scouter_id:
                    match_role = 'red1'; break;
                case match?.red2_scouter_id:
                    match_role = 'red2'; break;
                case match?.red3_scouter_id:
                    match_role = 'red3'; break;
                case match?.qual_red_scouter_id:
                    match_role = 'qualRed'; break;
                default:
                    match_role = 'Unknown'; break;
            }

            if (match_role === 'Unknown') {
                console.log('User is not assigned to this match');
                navigate(-1);
            }

            const events = await getEvents();
            const event = events.find(event => event.id === match?.event_id);
            const teamNumbersMap: Record<string, number | null> = {};

            if (event?.event_code) {
              const teamNumber = await getMatchTeam(
                event.event_code,
                match?.match_number,
                match_role
              );
  
              if (teamNumber) {
                teamNumbersMap[`${match_id}-${match_role}`] = teamNumber;
              }
            }

            // Fetch team photo if not a qual role
            if (match_role !== "qualRed" && match_role !== "qualBlue") {
              const teamNumber = teamNumbersMap[`${match_id}-${match_role}`];
              if (teamNumber) {
                const photoUrl = await getTeamPhoto(teamNumber, CURRENT_YEAR);
                console.log(`Photo URL for team ${teamNumber}:`, photoUrl);
                setTeamPhoto(photoUrl);
              }
            }

            setMatchType(match?.match_type || 'Qualification');
            setMatchNumber(match?.match_number || 0);
            setRole(match_role);
            console.log(event.name);
            setTeamNumbers(teamNumbersMap);
            setTeamNumber(teamNumbersMap[`${match_id}-${match_role}`] || 0);
        };

        if (match_id != 'none') loadMatchData();
    }, [user?.id]);

    const updateMatchID = async () => {
      const events = await getEvents();
      const event = events.find(event => event.is_active);
      const teamNumbersMap: Record<string, number | null> = {};

      const eventMatches = await getEventMatches(event?.event_code || '')
      const match = eventMatches?.find(m => m.match_number === matchNumber && (m.match_type.toLowerCase() === matchType.toLowerCase()));
      if (!match || !role) {
        console.log('Can\' find match');
        return;
      }

      match_id = match.match_id;

      if (event?.event_code) {
        const teamNumber = await getMatchTeam(
          event.event_code,
          match?.match_number,
          role
        );

        if (teamNumber) {
          teamNumbersMap[`${match_id}-${role}`] = teamNumber;
        }
      }

      // Fetch team photo if not a qual role
      if (role !== "qualRed" && role !== "qualBlue") {
        const teamNumber = teamNumbersMap[`${match_id}-${role}`];
        if (teamNumber) {
          const photoUrl = await getTeamPhoto(teamNumber, CURRENT_YEAR);
          console.log(`Photo URL for team ${teamNumber}:`, photoUrl);
          setTeamPhoto(photoUrl);
        }
      }
      setTeamNumbers(teamNumbersMap);
      // setTeamNumber(teamNumbersMap[`${match_id}-${match_role}`] || 0);
    }

    const setCurrentEvent = async () => {
      setEvent(concurrentEvent.name);
    };

    return (
      <div className="space-y-3 py-4 grid place-items-center" style={ { padding: '20px' } }>
        <Button onClick={() => navigate(`/scouting`)} size="lg" // TODO: Pass in args to scouting
            className="h-20 text-lg font-semibold flex flex-col gap-2" style={ { width: '100%' } }>
          Start Scouting
        </Button>
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Tabs defaultValue="config" className="">
            <TabsContent value="config" className="">
              {/* Robot Image */}
              <div className="w-full h-40 bg-muted rounded-lg flex items-center justify-center border-2 border-border overflow-hidden mb-2">
                {loadingPhoto ? (
                  <div className="text-center">
                    <p className="text-muted-foreground font-semibold">
                      Loading...
                    </p>
                  </div>
                ) : teamPhoto ? (
                  <img
                    src={teamPhoto}
                    alt="Robot"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      console.error("Failed to load image:", teamPhoto);
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement!.innerHTML = `
                        <div class="text-center">
                          <p class="text-muted-foreground font-semibold">Robot Image</p>
                          <p class="text-sm text-muted-foreground">Failed to load</p>
                        </div>
                      `;
                    }}
                  />
                ) : (
                  <div className="text-center">
                    <p className="text-muted-foreground font-semibold">
                      Robot Image
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Not available
                    </p>
                  </div>
                )}
              </div>

              {/* Match Details */}
              <div className="space-y-2">
                <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">
                    Match Number
                  </span>
                  <Input className="font-semibold w-30 text-right" type='number' placeholder='#####' onInput={(e) => { setMatchNumber(e.currentTarget.value); updateMatchID(); }} value={matchNumber}/>
                </div>
                <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">
                    Team Number
                  </span>
                  <Input className="font-semibold w-30 text-right" type='number' placeholder='#####' onInput={(e) => { setTeamNumber(e.currentTarget.value); updateMatchID(); }} value={teamNumber} />
                </div>
                { teamNumbers[`${match_id}-${role}`] && ( <div className="flex justify-between items-center p-1 pl-3 bg-accent/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">
                    Your Role
                  </span>
                  <DropdownMenu className="font-semibold">
                    <DropdownMenuTrigger asChild>
                      <p className="px-7 bg-accent-foreground/10 p-2 border-b rounded-lg">{prettifyRole(role)}</p>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className='w-fit h-fit rounded-lg shadow-md border border-border bg-popover'>
                      <DropdownMenuItem className="p-2 px-7 bg-primary border-b rounded-lg" onClick={() => { setRole('red1'); updateMatchID(); }}>Red 1</DropdownMenuItem>
                      <DropdownMenuItem className="p-2 px-7 bg-primary border-b rounded-lg" onClick={() => { setRole('red2'); updateMatchID(); }}>Red 2</DropdownMenuItem>
                      <DropdownMenuItem className="p-2 px-7 bg-primary border-b rounded-lg" onClick={() => { setRole('red3'); updateMatchID(); }}>Red 3</DropdownMenuItem>
                      <DropdownMenuItem className="p-2 px-7 bg-primary border-b rounded-lg" onClick={() => { setRole('qualRed'); updateMatchID(); }}>Qual Red</DropdownMenuItem>
                      <DropdownMenuItem className="p-2 px-7 bg-chart-5 border-b rounded-lg" onClick={() => { setRole('blue1'); updateMatchID(); }}>Blue 1</DropdownMenuItem>
                      <DropdownMenuItem className="p-2 px-7 bg-chart-5 border-b rounded-lg" onClick={() => { setRole('blue2'); updateMatchID(); }}>Blue 2</DropdownMenuItem>
                      <DropdownMenuItem className="p-2 px-7 bg-chart-5 border-b rounded-lg" onClick={() => { setRole('blue3'); updateMatchID(); }}>Blue 3</DropdownMenuItem>
                      <DropdownMenuItem className="p-2 px-7 bg-chart-5 border-b rounded-lg" onClick={() => { setRole('qualBlue'); updateMatchID(); }}>Qual Blue</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div> )}
                <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground">
                    Match Type
                  </span>
                  <DropdownMenu className="font-semibold">
                    <DropdownMenuTrigger asChild>
                      <p className="px-7 bg-accent-foreground/10 p-2 border-b rounded-lg">{matchType}</p>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className='w-fit h-fit rounded-lg shadow-md border border-border bg-popover'>
                      <DropdownMenuItem className="p-2 px-7 bg-accent-foreground/10 border-b rounded-lg" onClick={() => { setMatchType('Qualification'); updateMatchID(); }}>Qualification</DropdownMenuItem>
                      <DropdownMenuItem className="p-2 px-7 bg-accent-foreground/10 border-b rounded-lg" onClick={() => { setMatchType('Playoff'); updateMatchID(); }}>Playoff</DropdownMenuItem>
                      <DropdownMenuItem className="p-2 px-7 bg-accent-foreground/10 border-b rounded-lg" onClick={() => { setMatchType('Practice'); updateMatchID(); }}>Practice</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {/* <div className="flex justify-between items-center pl-3 p-1 bg-accent/50 rounded-lg">
                  <span className="text-sm font-medium text-muted-foreground pr-4">
                    Event
                  </span>
                  <Input type='text' className="font-semibold text-right" onInput={(e) => setEvent(e.currentTarget.value)} value={currentEvent} placeholder='Event Name' />
                </div>
                { currentEvent && concurrentEvent && concurrentEvent.name != currentEvent ? <Button className="w-full bg-accent p-3" onClick={() => { setCurrentEvent() }}>Use Current Event</Button> : null} */}
              </div>
            </TabsContent>
            <TabsContent value="game">
              <p>:skull:</p>
            </TabsContent>
            <TabsList className='fixed h-8 left-0 w-full text-center bottom-6'>
              <TabsTrigger value="config" className='w-2/5 pw-10 py-2 data-[state=active]:border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mx-1'>Settings</TabsTrigger>
              <TabsTrigger value="game" className='w-2/5 pw-10 py-2 data-[state=active]:border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 mx-1'>Games</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
    );
}