const Tournament = require('../models/Tournament');
const TournamentTeam = require('../models/TournamentTeam');
const User = require('../models/User');
const Payment = require('../models/Payment');
const MatchResult = require('../models/MatchResult');

const tournamentController = {
  // Create tournament (Admin only)
  createTournament: async (req, res) => {
    try {
      const {
        name,
        description,
        type,
        startDate,
        endDate,
        registrationStart,
        registrationEnd,
        isPaid,
        serviceFee,
        prizePool,
        maxTeams,
        rules,
        scoringSystem,
        totalMatches
      } = req.body;

      // Create tournament
      const tournament = new Tournament({
        name,
        description,
        type,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        registrationStart: new Date(registrationStart),
        registrationEnd: new Date(registrationEnd),
        isPaid,
        serviceFee: isPaid ? serviceFee : 0,
        prizePool,
        maxTeams,
        rules: rules || [],
        scoringSystem: scoringSystem || {
          killPoints: 10,
          placementPoints: [
            { rank: 1, points: 100 },
            { rank: 2, points: 80 },
            { rank: 3, points: 70 },
            { rank: 4, points: 60 },
            { rank: 5, points: 50 },
            { rank: 6, points: 40 },
            { rank: 7, points: 30 },
            { rank: 8, points: 20 },
            { rank: 9, points: 10 },
            { rank: 10, points: 5 }
          ]
        },
        totalMatches,
        createdBy: req.user._id,
        status: 'draft'
      });

      await tournament.save();

      res.status(201).json({
        success: true,
        message: 'Tournament created successfully',
        data: { tournament }
      });

    } catch (error) {
      console.error('Create tournament error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create tournament'
      });
    }
  },

  // Get all tournaments
  getAllTournaments: async (req, res) => {
    try {
      const {
        status,
        type,
        isPaid,
        page = 1,
        limit = 10,
        sort = '-createdAt',
        search
      } = req.query;

      const query = { isDeleted: false };

      // Apply filters
      if (status) query.status = status;
      if (type) query.type = type;
      if (isPaid !== undefined) query.isPaid = isPaid === 'true';

      // Search functionality
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query
      const tournaments = await Tournament.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'name email')
        .lean();

      const total = await Tournament.countDocuments(query);

      // Add virtual fields
      const tournamentsWithVirtuals = tournaments.map(tournament => ({
        ...tournament,
        isRegistrationOpen: tournament.registrationStart <= new Date() && 
                           tournament.registrationEnd >= newDate(),
        availableSlots: tournament.type === 'solo' 
          ? tournament.maxPlayers - tournament.registrationCount
          : tournament.maxTeams - tournament.teamCount,
        registrationPercentage: tournament.type === 'solo'
          ? (tournament.registrationCount / tournament.maxPlayers) * 100
          : (tournament.teamCount / tournament.maxTeams) * 100
      }));

      res.json({
        success: true,
        data: {
          tournaments: tournamentsWithVirtuals,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });

    } catch (error) {
      console.error('Get tournaments error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tournaments'
      });
    }
  },

  // Get single tournament
  getTournament: async (req, res) => {
    try {
      const { id } = req.params;

      const tournament = await Tournament.findById(id)
        .populate('createdBy', 'name email')
        .populate('registeredPlayers.userId', 'name email inGameName')
        .populate('teams', 'teamName teamTag captain members')
        .populate('winners.userId', 'name inGameName')
        .lean();

      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Add virtual fields
      tournament.isRegistrationOpen = tournament.registrationStart <= new Date() && 
                                     tournament.registrationEnd >= new Date();
      tournament.isLive = tournament.startDate <= new Date() && 
                         (!tournament.endDate || tournament.endDate >= new Date());
      tournament.availableSlots = tournament.type === 'solo' 
        ? tournament.maxPlayers - tournament.registrationCount
        : tournament.maxTeams - tournament.teamCount;

      res.json({
        success: true,
        data: { tournament }
      });

    } catch (error) {
      console.error('Get tournament error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tournament'
      });
    }
  },

  // Update tournament (Admin only)
  updateTournament: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if tournament exists
      const tournament = await Tournament.findById(id);
      
      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Check if tournament is live or completed
      if (tournament.status === 'live' || tournament.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update a live or completed tournament'
        });
      }

      // Update tournament
      const updatedTournament = await Tournament.findByIdAndUpdate(
        id,
        { $set: updates, lastUpdatedBy: req.user._id },
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        message: 'Tournament updated successfully',
        data: { tournament: updatedTournament }
      });

    } catch (error) {
      console.error('Update tournament error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update tournament'
      });
    }
  },

  // Delete tournament (Admin only)
  deleteTournament: async (req, res) => {
    try {
      const { id } = req.params;

      const tournament = await Tournament.findById(id);
      
      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Soft delete
      tournament.isDeleted = true;
      tournament.deletedAt = new Date();
      tournament.deletedBy = req.user._id;
      await tournament.save();

      res.json({
        success: true,
        message: 'Tournament deleted successfully'
      });

    } catch (error) {
      console.error('Delete tournament error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete tournament'
      });
    }
  },

  // Register for tournament (Individual)
  registerIndividual: async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const { bgmiId, inGameName } = req.body;

      // Get tournament
      const tournament = await Tournament.findById(tournamentId);
      
      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Check if registration is open
      if (!tournament.isRegistrationOpen) {
        return res.status(400).json({
          success: false,
          message: 'Registration is closed for this tournament'
        });
      }

      // Check if already registered
      const isRegistered = tournament.registeredPlayers.some(
        player => player.userId.toString() === req.user._id.toString()
      );

      if (isRegistered) {
        return res.status(400).json({
          success: false,
          message: 'You are already registered for this tournament'
        });
      }

      // Check available slots
      if (tournament.registrationCount >= tournament.maxPlayers) {
        return res.status(400).json({
          success: false,
          message: 'Tournament is full'
        });
      }

      // Add to registered players
      tournament.registeredPlayers.push({
        userId: req.user._id,
        registrationType: 'individual',
        bgmiId,
        inGameName,
        registeredAt: new Date()
      });

      tournament.registrationCount = tournament.registeredPlayers.length;
      await tournament.save();

      // Update user's tournament history
      await User.findByIdAndUpdate(req.user._id, {
        $push: {
          tournaments: {
            tournamentId: tournament._id,
            status: 'registered'
          }
        },
        $inc: { totalTournaments: 1 }
      });

      // If paid tournament, create payment record
      let payment = null;
      if (tournament.isPaid) {
        payment = new Payment({
          userId: req.user._id,
          tournamentId: tournament._id,
          amount: tournament.serviceFee,
          paymentType: 'individual',
          paymentStatus: 'pending',
          paymentGateway: 'razorpay',
          customerDetails: {
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            bgmiId,
            inGameName
          }
        });

        await payment.save();

        // Update tournament registration with payment info
        const playerIndex = tournament.registeredPlayers.length - 1;
        tournament.registeredPlayers[playerIndex].paymentId = payment._id;
        await tournament.save();
      }

      res.status(201).json({
        success: true,
        message: tournament.isPaid 
          ? 'Registration successful. Please complete payment.' 
          : 'Registration successful',
        data: {
          tournament: {
            _id: tournament._id,
            name: tournament.name,
            startDate: tournament.startDate
          },
          payment: payment ? {
            _id: payment._id,
            amount: payment.amount,
            status: payment.paymentStatus
          } : null
        }
      });

    } catch (error) {
      console.error('Individual registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed'
      });
    }
  },

  // Register team for tournament
  registerTeam: async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const { teamName, teamTag, members } = req.body;

      // Get tournament
      const tournament = await Tournament.findById(tournamentId);
      
      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Check if tournament supports teams
      if (!tournament.allowTeamRegistration) {
        return res.status(400).json({
          success: false,
          message: 'This tournament does not support team registration'
        });
      }

      // Check if registration is open
      if (!tournament.isRegistrationOpen) {
        return res.status(400).json({
          success: false,
          message: 'Registration is closed for this tournament'
        });
      }

      // Check available slots
      if (tournament.teamCount >= tournament.maxTeams) {
        return res.status(400).json({
          success: false,
          message: 'Tournament is full'
        });
      }

      // Validate team size
      if (members.length + 1 !== tournament.teamSize) {
        return res.status(400).json({
          success: false,
          message: `Team must have exactly ${tournament.teamSize} members`
        });
      }

      // Validate all BGMI IDs
      const allBGMIIds = [req.user.bgmiId, ...members.map(m => m.bgmiId)];
      const uniqueIds = [...new Set(allBGMIIds)];
      
      if (uniqueIds.length !== allBGMIIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate BGMI IDs found'
        });
      }

      // Create tournament team
      const tournamentTeam = new TournamentTeam({
        tournamentId: tournament._id,
        teamName,
        teamTag,
        captain: {
          userId: req.user._id,
          bgmiId: req.user.bgmiId,
          inGameName: req.user.inGameName,
          phone: req.user.phone
        },
        members: members.map(member => ({
          userId: member.userId,
          bgmiId: member.bgmiId,
          inGameName: member.inGameName,
          phone: member.phone,
          position: member.position || 'flex',
          status: 'pending'
        })),
        registeredBy: req.user._id
      });

      await tournamentTeam.save();

      // Add team to tournament
      tournament.teams.push(tournamentTeam._id);
      tournament.teamCount = tournament.teams.length;
      
      // Add captain to registered players
      tournament.registeredPlayers.push({
        userId: req.user._id,
        registrationType: 'team_captain',
        teamId: tournamentTeam._id,
        teamName,
        isCaptain: true,
        bgmiId: req.user.bgmiId,
        inGameName: req.user.inGameName,
        registeredAt: new Date()
      });

      // Add team members to registered players
      members.forEach(member => {
        tournament.registeredPlayers.push({
          userId: member.userId,
          registrationType: 'team_member',
          teamId: tournamentTeam._id,
          teamName,
          isCaptain: false,
          bgmiId: member.bgmiId,
          inGameName: member.inGameName,
          registeredAt: new Date()
        });
      });

      tournament.registrationCount = tournament.registeredPlayers.length;
      await tournament.save();

      // If paid tournament, create payment record
      let payment = null;
      if (tournament.isPaid) {
        payment = new Payment({
          userId: req.user._id,
          tournamentId: tournament._id,
          teamId: tournamentTeam._id,
          amount: tournament.serviceFee,
          paymentType: 'team',
          payingCaptainId: req.user._id,
          coveredUsers: [
            {
              userId: req.user._id,
              bgmiId: req.user.bgmiId,
              inGameName: req.user.inGameName,
              isCaptain: true
            },
            ...members.map(member => ({
              userId: member.userId,
              bgmiId: member.bgmiId,
              inGameName: member.inGameName,
              isCaptain: false
            }))
          ],
          paymentStatus: 'pending',
          paymentGateway: 'razorpay',
          customerDetails: {
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            bgmiId: req.user.bgmiId,
            inGameName: req.user.inGameName
          }
        });

        await payment.save();

        // Update team with payment info
        tournamentTeam.paymentId = payment._id;
        await tournamentTeam.save();
      }

      // Send notifications to team members
      members.forEach(async member => {
        // Create notification for each member
        // (You would implement your notification system here)
        console.log(`Notification sent to ${member.inGameName} to join team`);
      });

      res.status(201).json({
        success: true,
        message: 'Team registration successful',
        data: {
          tournament: {
            _id: tournament._id,
            name: tournament.name
          },
          team: {
            _id: tournamentTeam._id,
            teamName: tournamentTeam.teamName,
            joinCode: tournamentTeam.joinCode
          },
          payment: payment ? {
            _id: payment._id,
            amount: payment.amount,
            status: payment.paymentStatus
          } : null
        }
      });

    } catch (error) {
      console.error('Team registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Team registration failed'
      });
    }
  },

  // Unregister from tournament
  unregister: async (req, res) => {
    try {
      const { tournamentId } = req.params;

      const tournament = await Tournament.findById(tournamentId);
      
      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Check if user is registered
      const playerIndex = tournament.registeredPlayers.findIndex(
        player => player.userId.toString() === req.user._id.toString()
      );

      if (playerIndex === -1) {
        return res.status(400).json({
          success: false,
          message: 'You are not registered for this tournament'
        });
      }

      // Check if tournament has started
      if (tournament.startDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot unregister after tournament has started'
        });
      }

      const player = tournament.registeredPlayers[playerIndex];

      // If team registration, handle team logic
      if (player.teamId) {
        const team = await TournamentTeam.findById(player.teamId);
        
        if (team && player.isCaptain) {
          // Captain leaving - disband team
          team.registrationStatus = 'withdrawn';
          await team.save();

          // Remove all team members from tournament
          tournament.registeredPlayers = tournament.registeredPlayers.filter(
            p => p.teamId?.toString() !== player.teamId.toString()
          );
        } else if (team) {
          // Team member leaving
          team.members = team.members.filter(
            m => m.userId.toString() !== req.user._id.toString()
          );
          await team.save();

          // Remove player from tournament
          tournament.registeredPlayers.splice(playerIndex, 1);
        }
      } else {
        // Individual registration - just remove player
        tournament.registeredPlayers.splice(playerIndex, 1);
      }

      // Update counts
      tournament.registrationCount = tournament.registeredPlayers.length;
      if (player.teamId && player.isCaptain) {
        tournament.teamCount = tournament.teams.filter(
          t => t.toString() !== player.teamId.toString()
        ).length;
        tournament.teams = tournament.teams.filter(
          t => t.toString() !== player.teamId.toString()
        );
      }

      await tournament.save();

      // Update user's tournament history
      await User.findByIdAndUpdate(req.user._id, {
        $pull: {
          tournaments: { tournamentId: tournament._id }
        },
        $inc: { totalTournaments: -1 }
      });

      // Handle refund if paid
      if (player.paymentId) {
        const payment = await Payment.findById(player.paymentId);
        if (payment && payment.paymentStatus === 'success') {
          // Initiate refund
          payment.initiateRefund({
            amount: payment.amount,
            reason: 'Player unregistered from tournament',
            initiatedBy: req.user._id
          });
          await payment.save();
        }
      }

      res.json({
        success: true,
        message: 'Successfully unregistered from tournament'
      });

    } catch (error) {
      console.error('Unregister error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to unregister'
      });
    }
  },

  // Get tournament leaderboard
  getLeaderboard: async (req, res) => {
    try {
      const { tournamentId } = req.params;

      const tournament = await Tournament.findById(tournamentId)
        .select('leaderboard name type')
        .populate('leaderboard.userId', 'name inGameName')
        .populate('leaderboard.teamId', 'teamName teamTag')
        .lean();

      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Sort leaderboard by totalPoints
      const sortedLeaderboard = tournament.leaderboard
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1
        }));

      res.json({
        success: true,
        data: {
          tournament: {
            _id: tournament._id,
            name: tournament.name,
            type: tournament.type
          },
          leaderboard: sortedLeaderboard
        }
      });

    } catch (error) {
      console.error('Get leaderboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch leaderboard'
      });
    }
  },

  // Get tournament participants
  getParticipants: async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const { type, page = 1, limit = 20 } = req.query;

      const tournament = await Tournament.findById(tournamentId)
        .select('registeredPlayers name type')
        .populate('registeredPlayers.userId', 'name email inGameName profileImage')
        .lean();

      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      let participants = tournament.registeredPlayers;

      // Filter by type if specified
      if (type === 'individual') {
        participants = participants.filter(p => p.registrationType === 'individual');
      } else if (type === 'team') {
        participants = participants.filter(p => p.registrationType !== 'individual');
      }

      // Paginate
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const paginatedParticipants = participants.slice(skip, skip + parseInt(limit));

      // Group team members
      const groupedParticipants = tournament.type !== 'solo' 
        ? this.groupTeamMembers(paginatedParticipants)
        : paginatedParticipants;

      res.json({
        success: true,
        data: {
          tournament: {
            _id: tournament._id,
            name: tournament.name,
            type: tournament.type
          },
          participants: groupedParticipants,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: participants.length,
            pages: Math.ceil(participants.length / parseInt(limit))
          }
        }
      });

    } catch (error) {
      console.error('Get participants error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch participants'
      });
    }
  },

  // Helper function to group team members
  groupTeamMembers: (participants) => {
    const teamsMap = new Map();

    participants.forEach(participant => {
      if (participant.teamId) {
        if (!teamsMap.has(participant.teamId.toString())) {
          teamsMap.set(participant.teamId.toString(), {
            teamId: participant.teamId,
            teamName: participant.teamName,
            members: []
          });
        }
        
        const team = teamsMap.get(participant.teamId.toString());
        team.members.push({
          userId: participant.userId,
          name: participant.userId?.name,
          inGameName: participant.inGameName,
          isCaptain: participant.isCaptain,
          registrationType: participant.registrationType
        });
      }
    });

    // Convert to array and add individual participants
    const teams = Array.from(teamsMap.values());
    const individuals = participants.filter(p => !p.teamId);

    return [...teams, ...individuals];
  },

  // Update tournament status (Admin only)
  updateStatus: async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const { status } = req.body;

      const validStatuses = [
        'draft', 'upcoming', 'registration_open', 'registration_closed',
        'check_in_open', 'live', 'completed', 'cancelled'
      ];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }

      const tournament = await Tournament.findById(tournamentId);
      
      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Update status
      tournament.status = status;
      
      // Set timestamps based on status
      const now = new Date();
      switch (status) {
        case 'live':
          tournament.publishedAt = now;
          break;
        case 'completed':
          tournament.endDate = now;
          break;
        case 'cancelled':
          tournament.cancelledAt = now;
          break;
      }

      await tournament.save();

      res.json({
        success: true,
        message: `Tournament status updated to ${status}`,
        data: { tournament }
      });

    } catch (error) {
      console.error('Update status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update tournament status'
      });
    }
  },

  // Get user's tournament registrations
  getMyRegistrations: async (req, res) => {
    try {
      const { status, page = 1, limit = 10 } = req.query;

      const user = await User.findById(req.user._id)
        .populate({
          path: 'tournaments.tournamentId',
          select: 'name startDate endDate status prizePool type'
        })
        .select('tournaments');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      let registrations = user.tournaments;

      // Filter by status if specified
      if (status) {
        registrations = registrations.filter(r => r.status === status);
      }

      // Paginate
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const paginatedRegistrations = registrations.slice(skip, skip + parseInt(limit));

      // Get additional tournament details
      const detailedRegistrations = await Promise.all(
        paginatedRegistrations.map(async registration => {
          const tournament = await Tournament.findById(registration.tournamentId)
            .select('name startDate endDate status prizePool type bannerImage')
            .lean();
          
          return {
            ...registration.toObject(),
            tournament
          };
        })
      );

      res.json({
        success: true,
        data: {
          registrations: detailedRegistrations,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: registrations.length,
            pages: Math.ceil(registrations.length / parseInt(limit))
          }
        }
      });

    } catch (error) {
      console.error('Get my registrations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch registrations'
      });
    }
  }
};

module.exports = tournamentController;