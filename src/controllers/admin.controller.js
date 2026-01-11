const User = require('../models/User');
const Tournament = require('../models/Tournament');
const TournamentTeam = require('../models/TournamentTeam');
const Payment = require('../models/Payment');
const MatchResult = require('../models/MatchResult');
const WinnerProfile = require('../models/WinnerProfile');
const Team = require('../models/Team');

const adminController = {
  // Get all users with filtering and pagination
  getAllUsers: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search = '',
        role,
        status,
        sort = '-createdAt',
        verified,
        fromDate,
        toDate
      } = req.query;

      // Build query
      const query = { isDeleted: false };

      // Search by name, email, phone, or BGMI ID
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { bgmiId: { $regex: search, $options: 'i' } },
          { inGameName: { $regex: search, $options: 'i' } }
        ];
      }

      // Filter by role
      if (role) {
        query.role = role;
      }

      // Filter by email/phone verification
      if (verified === 'email') {
        query.emailVerified = true;
      } else if (verified === 'phone') {
        query.phoneVerified = true;
      } else if (verified === 'both') {
        query.emailVerified = true;
        query.phoneVerified = true;
      } else if (verified === 'none') {
        query.emailVerified = false;
        query.phoneVerified = false;
      }

      // Filter by date range
      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query
      const users = await User.find(query)
        .select('-password -__v')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await User.countDocuments(query);

      // Get additional stats for each user
      const usersWithStats = await Promise.all(
        users.map(async (user) => {
          const [
            tournamentCount,
            tournamentsWon,
            totalPrize,
            activeRegistrations
          ] = await Promise.all([
            Tournament.countDocuments({ 'registeredPlayers.userId': user._id }),
            WinnerProfile.countDocuments({ userId: user._id }),
            WinnerProfile.aggregate([
              { $match: { userId: user._id } },
              { $group: { _id: null, total: { $sum: '$prizeAmount' } } }
            ]),
            Tournament.countDocuments({
              'registeredPlayers.userId': user._id,
              status: { $in: ['registration_open', 'upcoming', 'live'] }
            })
          ]);

          return {
            ...user,
            stats: {
              tournamentCount,
              tournamentsWon: tournamentsWon,
              totalPrize: totalPrize[0]?.total || 0,
              activeRegistrations
            }
          };
        })
      );

      res.json({
        success: true,
        data: {
          users: usersWithStats,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });

    } catch (error) {
      console.error('Get all users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  },

  // Get single user with detailed information
  getUser: async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId)
        .select('-password -__v')
        .populate('tournaments.tournamentId', 'name startDate prizePool status')
        .lean();

      if (!user || user.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user's tournament statistics
      const [
        tournamentRegistrations,
        tournamentTeams,
        payments,
        matchResults,
        winnerProfiles,
        teams
      ] = await Promise.all([
        Tournament.find({ 'registeredPlayers.userId': user._id })
          .select('name startDate status prizePool registrationType')
          .sort('-startDate')
          .limit(10)
          .lean(),
        TournamentTeam.find({
          $or: [
            { 'captain.userId': user._id },
            { 'members.userId': user._id }
          ]
        })
          .populate('tournamentId', 'name startDate')
          .limit(10)
          .lean(),
        Payment.find({ userId: user._id })
          .sort('-createdAt')
          .limit(10)
          .lean(),
        MatchResult.find({ 'results.userId': user._id })
          .populate('tournamentId', 'name')
          .sort('-matchPlayedAt')
          .limit(10)
          .lean(),
        WinnerProfile.find({ userId: user._id })
          .populate('tournamentId', 'name startDate')
          .sort('-createdAt')
          .lean(),
        Team.find({ 'members.userId': user._id })
          .select('name tag status')
          .lean()
      ]);

      // Calculate total stats
      const totalStats = await Promise.all([
        Tournament.countDocuments({ 'registeredPlayers.userId': user._id }),
        WinnerProfile.countDocuments({ userId: user._id }),
        WinnerProfile.aggregate([
          { $match: { userId: user._id } },
          { $group: { _id: null, total: { $sum: '$prizeAmount' } } }
        ]),
        Payment.aggregate([
          { $match: { userId: user._id, paymentStatus: 'success' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      res.json({
        success: true,
        data: {
          user,
          stats: {
            totalTournaments: totalStats[0] || 0,
            tournamentsWon: totalStats[1] || 0,
            totalPrizeMoney: totalStats[2][0]?.total || 0,
            totalPayments: totalStats[3][0]?.total || 0
          },
          recentActivity: {
            tournamentRegistrations,
            tournamentTeams,
            payments,
            matchResults,
            winnerProfiles,
            teams
          }
        }
      });

    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user details'
      });
    }
  },

  // Create new user (admin only)
  createUser: async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        role,
        phone,
        bgmiId,
        inGameName,
        emailVerified = false,
        phoneVerified = false
      } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { phone }, { bgmiId }]
      });

      if (existingUser) {
        let field = '';
        if (existingUser.email === email) field = 'Email';
        else if (existingUser.phone === phone) field = 'Phone';
        else if (existingUser.bgmiId === bgmiId) field = 'BGMI ID';

        return res.status(400).json({
          success: false,
          message: `${field} already registered`
        });
      }

      // Create user
      const user = new User({
        name,
        email,
        password, // Will be hashed by pre-save hook
        role: role || 'user',
        phone,
        bgmiId,
        inGameName,
        emailVerified,
        phoneVerified,
        profileCompleted: Boolean(bgmiId && phone && inGameName),
        createdBy: req.user._id
      });

      await user.save();

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: { user: userResponse }
      });

    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create user'
      });
    }
  },

  // Update user
  updateUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const updates = req.body;

      // Prevent updating password via this endpoint
      if (updates.password) {
        delete updates.password;
      }

      // Check if trying to update super_admin
      const targetUser = await User.findById(userId);
      if (targetUser.role === 'super_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Cannot update super admin user'
        });
      }

      // Check if trying to change role to super_admin
      if (updates.role === 'super_admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Only super admin can assign super admin role'
        });
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updates, updatedBy: req.user._id },
        { new: true, runValidators: true }
      ).select('-password -__v');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'User updated successfully',
        data: { user }
      });

    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user'
      });
    }
  },

  // Delete user (soft delete)
  deleteUser: async (req, res) => {
    try {
      const { userId } = req.params;

      // Prevent deleting self
      if (userId === req.user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your own account'
        });
      }

      // Check if user exists
      const user = await User.findById(userId);
      
      if (!user || user.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Prevent deleting super_admin
      if (user.role === 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Cannot delete super admin user'
        });
      }

      // Soft delete
      user.isDeleted = true;
      user.deletedAt = new Date();
      user.deletedBy = req.user._id;
      await user.save();

      // Also mark user's active registrations as withdrawn
      await Tournament.updateMany(
        {
          'registeredPlayers.userId': userId,
          status: { $in: ['registration_open', 'upcoming'] }
        },
        {
          $set: {
            'registeredPlayers.$[elem].status': 'withdrawn'
          }
        },
        {
          arrayFilters: [{ 'elem.userId': userId }]
        }
      );

      res.json({
        success: true,
        message: 'User deleted successfully'
      });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete user'
      });
    }
  },

  // Get tournament statistics
  getTournamentStats: async (req, res) => {
    try {
      const { fromDate, toDate, status, type } = req.query;

      const matchStage = {};

      // Date filter
      if (fromDate || toDate) {
        matchStage.createdAt = {};
        if (fromDate) matchStage.createdAt.$gte = new Date(fromDate);
        if (toDate) matchStage.createdAt.$lte = new Date(toDate);
      }

      // Status filter
      if (status) {
        matchStage.status = status;
      }

      // Type filter
      if (type) {
        matchStage.type = type;
      }

      matchStage.isDeleted = false;

      // Aggregate tournament statistics
      const stats = await Tournament.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalTournaments: { $sum: 1 },
            totalPrizePool: { $sum: '$prizePool' },
            totalRevenue: {
              $sum: {
                $cond: [
                  { $eq: ['$isPaid', true] },
                  { $multiply: ['$serviceFee', '$registrationCount'] },
                  0
                ]
              }
            },
            totalRegistrations: { $sum: '$registrationCount' },
            avgPrizePool: { $avg: '$prizePool' },
            avgRegistrations: { $avg: '$registrationCount' }
          }
        },
        {
          $project: {
            _id: 0,
            totalTournaments: 1,
            totalPrizePool: 1,
            totalRevenue: 1,
            totalRegistrations: 1,
            avgPrizePool: { $round: ['$avgPrizePool', 2] },
            avgRegistrations: { $round: ['$avgRegistrations', 2] }
          }
        }
      ]);

      // Get tournament count by status
      const statusStats = await Tournament.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Get tournament count by type
      const typeStats = await Tournament.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Get recent tournaments
      const recentTournaments = await Tournament.find(matchStage)
        .sort('-createdAt')
        .limit(5)
        .select('name startDate status prizePool registrationCount')
        .lean();

      // Get upcoming tournaments
      const upcomingTournaments = await Tournament.find({
        ...matchStage,
        startDate: { $gt: new Date() }
      })
        .sort('startDate')
        .limit(5)
        .select('name startDate prizePool maxTeams teamCount')
        .lean();

      res.json({
        success: true,
        data: {
          overview: stats[0] || {
            totalTournaments: 0,
            totalPrizePool: 0,
            totalRevenue: 0,
            totalRegistrations: 0,
            avgPrizePool: 0,
            avgRegistrations: 0
          },
          statusDistribution: statusStats,
          typeDistribution: typeStats,
          recentTournaments,
          upcomingTournaments
        }
      });

    } catch (error) {
      console.error('Get tournament stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tournament statistics'
      });
    }
  },

  // Get tournament analytics
  getTournamentAnalytics: async (req, res) => {
    try {
      const { tournamentId } = req.params;

      const tournament = await Tournament.findById(tournamentId)
        .populate('registeredPlayers.userId', 'name inGameName')
        .populate('teams', 'teamName teamTag captain members')
        .populate('winners.userId', 'name inGameName')
        .lean();

      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Get payment statistics
      const paymentStats = await Payment.aggregate([
        {
          $match: {
            tournamentId: tournament._id,
            paymentStatus: 'success'
          }
        },
        {
          $group: {
            _id: '$paymentType',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      // Get team statistics
      const teamStats = await TournamentTeam.aggregate([
        {
          $match: { tournamentId: tournament._id }
        },
        {
          $group: {
            _id: '$registrationStatus',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get match results if available
      const matchResults = await MatchResult.find({ tournamentId })
        .sort('matchNumber')
        .lean();

      // Calculate registration growth over time
      const registrationTimeline = await Tournament.aggregate([
        { $match: { _id: tournament._id } },
        {
          $project: {
            registrationDates: {
              $map: {
                input: '$registeredPlayers',
                as: 'player',
                in: '$$player.registeredAt'
              }
            }
          }
        },
        { $unwind: '$registrationDates' },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$registrationDates' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      // Get player statistics
      const playerStats = {
        totalPlayers: tournament.registrationCount,
        paidPlayers: tournament.registeredPlayers.filter(p => p.paymentStatus === 'paid').length,
        checkedInPlayers: tournament.registeredPlayers.filter(p => p.checkInStatus).length,
        individualRegistrations: tournament.registeredPlayers.filter(p => p.registrationType === 'individual').length,
        teamRegistrations: tournament.registeredPlayers.filter(p => p.registrationType !== 'individual').length
      };

      res.json({
        success: true,
        data: {
          tournament,
          analytics: {
            paymentStats,
            teamStats,
            playerStats,
            registrationTimeline,
            matchResults: matchResults.length
          }
        }
      });

    } catch (error) {
      console.error('Get tournament analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tournament analytics'
      });
    }
  },

  // Create match result
  createMatchResult: async (req, res) => {
    try {
      const {
        tournamentId,
        matchNumber,
        results,
        map,
        matchType,
        screenshots
      } = req.body;

      // Check if tournament exists
      const tournament = await Tournament.findById(tournamentId);
      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Check if tournament is live or completed
      if (tournament.status !== 'live' && tournament.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Match results can only be added for live or completed tournaments'
        });
      }

      // Check if match number already exists
      const existingMatch = await MatchResult.findOne({
        tournamentId,
        matchNumber
      });

      if (existingMatch) {
        return res.status(400).json({
          success: false,
          message: `Match ${matchNumber} already has results`
        });
      }

      // Calculate points based on tournament scoring system
      const calculatedResults = results.map(result => {
        const placementPoints = tournament.scoringSystem.placementPoints?.find(
          p => p.rank === result.placement
        )?.points || 0;

        const killPoints = result.kills * (tournament.scoringSystem.killPoints || 10);
        const bonusPoints = tournament.scoringSystem.bonusPoints || 0;

        return {
          ...result,
          placementPoints,
          killPoints,
          bonusPoints,
          totalPoints: placementPoints + killPoints + bonusPoints
        };
      });

      // Create match result
      const matchResult = new MatchResult({
        tournamentId,
        matchNumber,
        results: calculatedResults,
        map: map || 'Erangel',
        matchType: matchType || 'TPP',
        screenshots: screenshots || [],
        submittedBy: req.user._id,
        matchPlayedAt: new Date()
      });

      await matchResult.save();

      // Update tournament leaderboard
      await updateTournamentLeaderboard(tournamentId);

      res.status(201).json({
        success: true,
        message: 'Match result added successfully',
        data: { matchResult }
      });

    } catch (error) {
      console.error('Create match result error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create match result'
      });
    }
  },

  // Update match result
  updateMatchResult: async (req, res) => {
    try {
      const { matchId } = req.params;
      const updates = req.body;

      const matchResult = await MatchResult.findById(matchId);
      
      if (!matchResult) {
        return res.status(404).json({
          success: false,
          message: 'Match result not found'
        });
      }

      // Recalculate points if results are updated
      if (updates.results) {
        const tournament = await Tournament.findById(matchResult.tournamentId);
        
        updates.results = updates.results.map(result => {
          const placementPoints = tournament.scoringSystem.placementPoints?.find(
            p => p.rank === result.placement
          )?.points || 0;

          const killPoints = result.kills * (tournament.scoringSystem.killPoints || 10);
          const bonusPoints = tournament.scoringSystem.bonusPoints || 0;

          return {
            ...result,
            placementPoints,
            killPoints,
            bonusPoints,
            totalPoints: placementPoints + killPoints + bonusPoints
          };
        });
      }

      // Update match result
      const updatedMatchResult = await MatchResult.findByIdAndUpdate(
        matchId,
        { $set: updates },
        { new: true, runValidators: true }
      );

      // Update tournament leaderboard
      await updateTournamentLeaderboard(matchResult.tournamentId);

      res.json({
        success: true,
        message: 'Match result updated successfully',
        data: { matchResult: updatedMatchResult }
      });

    } catch (error) {
      console.error('Update match result error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update match result'
      });
    }
  },

  // Delete match result
  deleteMatchResult: async (req, res) => {
    try {
      const { matchId } = req.params;

      const matchResult = await MatchResult.findById(matchId);
      
      if (!matchResult) {
        return res.status(404).json({
          success: false,
          message: 'Match result not found'
        });
      }

      const tournamentId = matchResult.tournamentId;

      // Delete match result
      await MatchResult.findByIdAndDelete(matchId);

      // Update tournament leaderboard
      await updateTournamentLeaderboard(tournamentId);

      res.json({
        success: true,
        message: 'Match result deleted successfully'
      });

    } catch (error) {
      console.error('Delete match result error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete match result'
      });
    }
  },

  // Declare winners
  declareWinners: async (req, res) => {
    try {
      const { tournamentId, winners } = req.body;

      // Check if tournament exists
      const tournament = await Tournament.findById(tournamentId);
      if (!tournament || tournament.isDeleted) {
        return res.status(404).json({
          success: false,
          message: 'Tournament not found'
        });
      }

      // Check if tournament is completed
      if (tournament.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Winners can only be declared for completed tournaments'
        });
      }

      // Check if winners already declared
      if (tournament.winners && tournament.winners.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Winners have already been declared for this tournament'
        });
      }

      // Validate winners
      const validatedWinners = await Promise.all(
        winners.map(async (winner) => {
          // Check if user exists and is registered for tournament
          const isRegistered = tournament.registeredPlayers.some(
            player => player.userId.toString() === winner.userId
          );

          if (!isRegistered) {
            throw new Error(`User ${winner.userId} is not registered for this tournament`);
          }

          // Get user details
          const user = await User.findById(winner.userId).select('name inGameName');
          
          // Get team details if team tournament
          let teamName = null;
          let teamId = null;
          
          if (tournament.type !== 'solo') {
            const registration = tournament.registeredPlayers.find(
              p => p.userId.toString() === winner.userId
            );
            
            if (registration && registration.teamId) {
              const team = await TournamentTeam.findById(registration.teamId);
              if (team) {
                teamName = team.teamName;
                teamId = team._id;
              }
            }
          }

          return {
            rank: winner.rank,
            userId: winner.userId,
            teamId,
            teamName,
            playerName: user.inGameName,
            prizeAmount: winner.prizeAmount,
            paymentStatus: 'pending'
          };
        })
      );

      // Update tournament with winners
      tournament.winners = validatedWinners;
      tournament.status = 'completed';
      await tournament.save();

      // Create winner profiles for homepage display
      await Promise.all(
        validatedWinners.map(async (winner) => {
          const winnerProfile = new WinnerProfile({
            tournamentId: tournament._id,
            userId: winner.userId,
            teamId: winner.teamId,
            rank: winner.rank,
            prizeAmount: winner.prizeAmount,
            inGameName: winner.playerName,
            teamName: winner.teamName,
            isFeatured: winner.rank <= 3, // Feature top 3 winners
            displayOrder: winner.rank
          });

          await winnerProfile.save();

          // Update user stats
          await User.findByIdAndUpdate(winner.userId, {
            $inc: {
              tournamentsWon: 1,
              totalPrizeMoney: winner.prizeAmount
            }
          });

          // Update team stats if team tournament
          if (winner.teamId) {
            await TournamentTeam.findByIdAndUpdate(winner.teamId, {
              $inc: { prizeWon: winner.prizeAmount },
              $set: { finalRank: winner.rank }
            });

            // Update permanent team stats if exists
            const tournamentTeam = await TournamentTeam.findById(winner.teamId);
            if (tournamentTeam.permanentTeamId) {
              await Team.findByIdAndUpdate(tournamentTeam.permanentTeamId, {
                $inc: {
                  tournamentsWon: 1,
                  totalPrizeMoney: winner.prizeAmount
                }
              });
            }
          }
        })
      );

      res.json({
        success: true,
        message: 'Winners declared successfully',
        data: {
          tournament: {
            _id: tournament._id,
            name: tournament.name,
            winners: validatedWinners
          }
        }
      });

    } catch (error) {
      console.error('Declare winners error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to declare winners'
      });
    }
  },

  // Get admin dashboard
  getDashboard: async (req, res) => {
    try {
      const [
        userStats,
        tournamentStats,
        paymentStats,
        recentRegistrations,
        upcomingTournaments,
        recentWinners
      ] = await Promise.all([
        // User statistics
        User.aggregate([
          { $match: { isDeleted: false } },
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              newUsersToday: {
                $sum: {
                  $cond: [
                    { $gte: ['$createdAt', new Date(Date.now() - 24 * 60 * 60 * 1000)] },
                    1,
                    0
                  ]
                }
              },
              activeUsers: {
                $sum: {
                  $cond: [
                    { $gte: ['$lastActive', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
                    1,
                    0
                  ]
                }
              },
              verifiedUsers: {
                $sum: {
                  $cond: [
                    { $and: ['$emailVerified', '$phoneVerified'] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ]),

        // Tournament statistics
        Tournament.aggregate([
          { $match: { isDeleted: false } },
          {
            $group: {
              _id: null,
              totalTournaments: { $sum: 1 },
              liveTournaments: {
                $sum: {
                  $cond: [{ $eq: ['$status', 'live'] }, 1, 0]
                }
              },
              upcomingTournaments: {
                $sum: {
                  $cond: [
                    { $in: ['$status', ['upcoming', 'registration_open']] },
                    1,
                    0
                  ]
                }
              },
              totalRegistrations: { $sum: '$registrationCount' },
              totalPrizePool: { $sum: '$prizePool' }
            }
          }
        ]),

        // Payment statistics
        Payment.aggregate([
          { $match: { paymentStatus: 'success' } },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$amount' },
              todayRevenue: {
                $sum: {
                  $cond: [
                    { $gte: ['$completedAt', new Date(Date.now() - 24 * 60 * 60 * 1000)] },
                    '$amount',
                    0
                  ]
                }
              },
              totalTransactions: { $sum: 1 },
              todayTransactions: {
                $sum: {
                  $cond: [
                    { $gte: ['$completedAt', new Date(Date.now() - 24 * 60 * 60 * 1000)] },
                    1,
                    0
                  ]
                }
              }
            }
          }
        ]),

        // Recent registrations
        Tournament.find({ 'registeredPlayers': { $exists: true, $ne: [] } })
          .sort({ 'registeredPlayers.registeredAt': -1 })
          .limit(5)
          .select('name registeredPlayers')
          .populate('registeredPlayers.userId', 'name inGameName')
          .lean(),

        // Upcoming tournaments
        Tournament.find({
          status: { $in: ['upcoming', 'registration_open'] },
          startDate: { $gt: new Date() }
        })
          .sort('startDate')
          .limit(5)
          .select('name startDate prizePool registrationCount maxTeams')
          .lean(),

        // Recent winners
        WinnerProfile.find()
          .sort('-createdAt')
          .limit(5)
          .populate('tournamentId', 'name')
          .populate('userId', 'inGameName')
          .lean()
      ]);

      // Calculate growth percentages (mock data - in production would compare with previous period)
      const growth = {
        users: 12.5,
        tournaments: 8.3,
        revenue: 15.2,
        registrations: 10.7
      };

      res.json({
        success: true,
        data: {
          overview: {
            users: userStats[0] || {
              totalUsers: 0,
              newUsersToday: 0,
              activeUsers: 0,
              verifiedUsers: 0
            },
            tournaments: tournamentStats[0] || {
              totalTournaments: 0,
              liveTournaments: 0,
              upcomingTournaments: 0,
              totalRegistrations: 0,
              totalPrizePool: 0
            },
            payments: paymentStats[0] || {
              totalRevenue: 0,
              todayRevenue: 0,
              totalTransactions: 0,
              todayTransactions: 0
            }
          },
          growth,
          recentActivity: {
            registrations: recentRegistrations,
            upcomingTournaments,
            winners: recentWinners
          }
        }
      });

    } catch (error) {
      console.error('Get dashboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard data'
      });
    }
  },

  // Get system statistics
  getSystemStats: async (req, res) => {
    try {
      const [
        dbStats,
        storageStats,
        performanceStats,
        errorLogs
      ] = await Promise.all([
        // Database statistics
        Promise.all([
          User.countDocuments(),
          Tournament.countDocuments(),
          Payment.countDocuments(),
          MatchResult.countDocuments(),
          WinnerProfile.countDocuments()
        ]),

        // Storage usage (mock - in production would check actual storage)
        getStorageUsage(),

        // Performance statistics (mock - in production would use monitoring tools)
        getPerformanceStats(),

        // Recent error logs (mock - would come from error logging service)
        getRecentErrorLogs()
      ]);

      res.json({
        success: true,
        data: {
          database: {
            users: dbStats[0],
            tournaments: dbStats[1],
            payments: dbStats[2],
            matchResults: dbStats[3],
            winnerProfiles: dbStats[4],
            total: dbStats.reduce((a, b) => a + b, 0)
          },
          storage: storageStats,
          performance: performanceStats,
          errors: errorLogs,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version
        }
      });

    } catch (error) {
      console.error('Get system stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch system statistics'
      });
    }
  },

  // Create backup
  createBackup: async (req, res) => {
    try {
      const { type = 'database', includeFiles = false } = req.body;

      // In production, this would trigger a backup process
      // For now, return mock response
      const backupInfo = {
        id: `backup_${Date.now()}`,
        type,
        timestamp: new Date(),
        status: 'initiated',
        size: '0 MB',
        downloadUrl: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      };

      // Simulate backup process
      setTimeout(async () => {
        // Update backup status in database
        console.log(`Backup ${backupInfo.id} completed`);
      }, 5000);

      res.json({
        success: true,
        message: 'Backup initiated successfully',
        data: { backup: backupInfo }
      });

    } catch (error) {
      console.error('Create backup error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create backup'
      });
    }
  },

  // Update tournament status
  updateTournamentStatus: async (req, res) => {
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

      // Validate status transition
      if (!isValidStatusTransition(tournament.status, status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${tournament.status} to ${status}`
        });
      }

      // Update status
      tournament.status = status;
      tournament.lastUpdatedBy = req.user._id;

      // Set timestamps based on status
      const now = new Date();
      switch (status) {
        case 'live':
          tournament.publishedAt = now;
          break;
        case 'completed':
          tournament.endDate = tournament.endDate || now;
          break;
        case 'cancelled':
          tournament.cancelledAt = now;
          // Process refunds for paid tournaments
          if (tournament.isPaid) {
            await processRefundsForCancelledTournament(tournamentId);
          }
          break;
      }

      await tournament.save();

      // Send notifications if needed
      if (status === 'live') {
        await sendTournamentLiveNotifications(tournamentId);
      } else if (status === 'completed') {
        await sendTournamentCompletedNotifications(tournamentId);
      }

      res.json({
        success: true,
        message: `Tournament status updated to ${status}`,
        data: { tournament }
      });

    } catch (error) {
      console.error('Update tournament status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update tournament status'
      });
    }
  },

  // Get payment analytics
  getPaymentAnalytics: async (req, res) => {
    try {
      const { fromDate, toDate, paymentGateway } = req.query;

      const matchStage = {};

      // Date filter
      if (fromDate || toDate) {
        matchStage.completedAt = {};
        if (fromDate) matchStage.completedAt.$gte = new Date(fromDate);
        if (toDate) matchStage.completedAt.$lte = new Date(toDate);
      }

      // Payment gateway filter
      if (paymentGateway) {
        matchStage.paymentGateway = paymentGateway;
      }

      matchStage.paymentStatus = 'success';

      const analytics = await Payment.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$completedAt' }
            },
            totalAmount: { $sum: '$amount' },
            transactionCount: { $sum: 1 },
            avgTransaction: { $avg: '$amount' }
          }
        },
        { $sort: { '_id': 1 } },
        {
          $project: {
            date: '$_id',
            totalAmount: 1,
            transactionCount: 1,
            avgTransaction: { $round: ['$avgTransaction', 2] }
          }
        }
      ]);

      // Get gateway distribution
      const gatewayDistribution = await Payment.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$paymentGateway',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);

      // Get payment method distribution
      const methodDistribution = await Payment.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$paymentMethod.type',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);

      res.json({
        success: true,
        data: {
          timeline: analytics,
          gatewayDistribution,
          methodDistribution
        }
      });

    } catch (error) {
      console.error('Get payment analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment analytics'
      });
    }
  }
};

// Helper function to update tournament leaderboard
async function updateTournamentLeaderboard(tournamentId) {
  try {
    const matchResults = await MatchResult.find({ tournamentId });
    
    if (matchResults.length === 0) {
      return;
    }

    // Aggregate results
    const playerStats = new Map();

    matchResults.forEach(match => {
      match.results.forEach(result => {
        const playerId = result.userId.toString();
        
        if (!playerStats.has(playerId)) {
          playerStats.set(playerId, {
            userId: result.userId,
            totalKills: 0,
            totalPlacementPoints: 0,
            totalBonusPoints: 0,
            totalPoints: 0,
            matchesPlayed: 0,
            avgKills: 0,
            avgPlacement: 0
          });
        }

        const stats = playerStats.get(playerId);
        stats.totalKills += result.kills;
        stats.totalPlacementPoints += result.placementPoints;
        stats.totalBonusPoints += result.bonusPoints;
        stats.totalPoints += result.totalPoints;
        stats.matchesPlayed += 1;
      });
    });

    // Calculate averages
    playerStats.forEach(stats => {
      stats.avgKills = stats.totalKills / stats.matchesPlayed;
      // Note: avgPlacement would need placement data per match
    });

    // Convert to array and sort by total points
    const leaderboard = Array.from(playerStats.values())
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1,
        previousRank: 0 // Would need previous state to calculate
      }));

    // Update tournament
    await Tournament.findByIdAndUpdate(tournamentId, {
      $set: { leaderboard }
    });

  } catch (error) {
    console.error('Update leaderboard error:', error);
  }
}

// Helper function to validate status transitions
function isValidStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    'draft': ['upcoming', 'cancelled'],
    'upcoming': ['registration_open', 'cancelled'],
    'registration_open': ['registration_closed', 'cancelled'],
    'registration_closed': ['check_in_open', 'cancelled'],
    'check_in_open': ['live', 'cancelled'],
    'live': ['completed', 'cancelled'],
    'completed': [],
    'cancelled': []
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

// Helper function to process refunds for cancelled tournament
async function processRefundsForCancelledTournament(tournamentId) {
  try {
    const successfulPayments = await Payment.find({
      tournamentId,
      paymentStatus: 'success',
      refunds: { $size: 0 } // No refunds processed yet
    });

    for (const payment of successfulPayments) {
      // Initiate refund
      payment.initiateRefund({
        amount: payment.amount,
        reason: 'Tournament cancelled',
        initiatedBy: null // System initiated
      });
      await payment.save();
    }

    console.log(`Refunds initiated for ${successfulPayments.length} payments`);
  } catch (error) {
    console.error('Process refunds error:', error);
  }
}

// Mock helper functions (would be implemented in production)
async function getStorageUsage() {
  return {
    total: '10 GB',
    used: '2.5 GB',
    free: '7.5 GB',
    usagePercentage: 25
  };
}

async function getPerformanceStats() {
  return {
    avgResponseTime: '125ms',
    requestsPerMinute: 45,
    errorRate: '0.5%',
    uptime: '99.9%'
  };
}

async function getRecentErrorLogs() {
  return [
    {
      timestamp: new Date(),
      message: 'Payment verification failed',
      level: 'error',
      count: 2
    },
    {
      timestamp: new Date(Date.now() - 3600000),
      message: 'Database connection timeout',
      level: 'warning',
      count: 1
    }
  ];
}

async function sendTournamentLiveNotifications(tournamentId) {
  console.log(`Sending live notifications for tournament ${tournamentId}`);
  // Implementation would send emails/push notifications
}

async function sendTournamentCompletedNotifications(tournamentId) {
  console.log(`Sending completed notifications for tournament ${tournamentId}`);
  // Implementation would send emails/push notifications
}

module.exports = adminController;