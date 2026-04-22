const express = require('express');
const path = require('path');
const { 
    Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, 
    PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder 
} = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [3276799] });

// Banco de dados preparado para múltiplos painéis
let db = {
    paineis: {}, // Armazena configurações por ID da mensagem
    chavePixPadrao: "Não definida"
};

async function registrarComandos(token, clientId) {
    const commands = [
        new SlashCommandBuilder()
            .setName('criar-painel')
            .setDescription('Cria um novo painel de vendas separado')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(token);
    try { await rest.put(Routes.applicationCommands(clientId), { body: commands }); } catch (e) {}
}

async function iniciarBot(token) {
    client.on('interactionCreate', async (i) => {
        if (!i.guild) return;

        let cargoDono = i.guild.roles.cache.find(r => r.name === 'Dono Sirius');
        let cargoVend = i.guild.roles.cache.find(r => r.name === 'Vendedor Sirius');
        if (!cargoDono) cargoDono = await i.guild.roles.create({ name: 'Dono Sirius', color: '#ff0000' });
        if (!cargoVend) cargoVend = await i.guild.roles.create({ name: 'Vendedor Sirius', color: '#00ff6a' });

        // 1. CRIAR NOVO PAINEL (COMANDO)
        if (i.isChatInputCommand() && i.commandName === 'criar-painel') {
            const embed = new EmbedBuilder()
                .setTitle("Novo Painel")
                .setDescription("Configure este painel no botão abaixo.")
                .setColor("#2f3136");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ver_opcoes').setLabel('Comprar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('config_painel').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('add_estoque').setLabel('Estoque').setEmoji('📦').setStyle(ButtonStyle.Primary)
            );

            const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });
            
            // Inicializa os dados deste painel específico
            db.paineis[msg.id] = {
                nome: "Novo Painel",
                desc: "Descrição do Painel",
                banner: null,
                produtos: []
            };
        }

        // --- TRAVA DE SEGURANÇA DONO SIRIUS ---
        if (i.isButton() && (i.customId === 'config_painel' || i.customId === 'add_estoque')) {
            if (!i.member.roles.cache.has(cargoDono.id)) {
                return i.reply({ content: "❌ Acesso restrito ao cargo **Dono Sirius**.", ephemeral: true });
            }
        }

        // 2. CONFIGURAR VITRINE (ESPECÍFICO DESTE PAINEL)
        if (i.isButton() && i.customId === 'config_painel') {
            const dados = db.paineis[i.message.id] || { nome: "", desc: "", banner: "" };
            const modal = new ModalBuilder().setCustomId(`m_vitrine_${i.message.id}`).setTitle('Configurar Vitrine');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_nome').setLabel('NOME DA LOJA').setStyle(TextInputStyle.Short).setValue(dados.nome || "")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_desc').setLabel('DESCREVER PAINEL').setStyle(TextInputStyle.Paragraph).setValue(dados.desc || "")),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('l_url').setLabel('URL DO BANNER').setStyle(TextInputStyle.Short).setValue(dados.banner || ""))
            );
            return await i.showModal(modal);
        }

        // 3. ADICIONAR ESTOQUE (ESPECÍFICO DESTE PAINEL)
        if (i.isButton() && i.customId === 'add_estoque') {
            const modal = new ModalBuilder().setCustomId(`m_estoque_${i.message.id}`).setTitle('Adicionar ao Estoque');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_nome').setLabel('NOME DO PRODUTO').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_valor').setLabel('VALOR DO PRODUTO').setStyle(TextInputStyle.Short)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('p_pix').setLabel('CHAVE PIX').setStyle(TextInputStyle.Short).setValue(db.chavePixPadrao))
            );
            return await i.showModal(modal);
        }

        // --- PROCESSAR MODALS ---
        if (i.isModalSubmit()) {
            const msgId = i.customId.split('_').pop(); // Pega o ID da mensagem do customID do modal
            
            if (i.customId.startsWith('m_vitrine_')) {
                db.paineis[msgId].nome = i.fields.getTextInputValue('l_nome');
                db.paineis[msgId].desc = i.fields.getTextInputValue('l_desc');
                db.paineis[msgId].banner = i.fields.getTextInputValue('l_url');

                const embed = new EmbedBuilder()
                    .setTitle(db.paineis[msgId].nome)
                    .setDescription(db.paineis[msgId].desc)
                    .setImage(db.paineis[msgId].banner)
                    .setColor("#00ff6a");

                await i.update({ embeds: [embed] });
            }

            if (i.customId.startsWith('m_estoque_')) {
                const nome = i.fields.getTextInputValue('p_nome');
                const valor = i.fields.getTextInputValue('p_valor');
                const pix = i.fields.getTextInputValue('p_pix');

                db.paineis[msgId].produtos.push({ nome, valor, pix });
                db.chavePixPadrao = pix;

                await i.reply({ content: `✅ Produto adicionado a este painel!`, ephemeral: true });
            }
        }

        // 4. COMPRAR (LÊ APENAS OS PRODUTOS DO PAINEL CLICADO)
        if (i.isButton() && i.customId === 'ver_opcoes') {
            const painel = db.paineis[i.message.id];
            if (!painel || painel.produtos.length === 0) return i.reply({ content: "❌ Este painel está sem estoque.", ephemeral: true });

            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId(`compra_${i.message.id}`).setPlaceholder('Selecione o produto')
                    .addOptions(painel.produtos.map((p, idx) => ({ label: p.nome, description: `Valor: ${p.valor}`, value: idx.toString() })))
            );
            await i.reply({ content: "Escolha um item:", components: [menu], ephemeral: true });
        }

        // 5. TICKET E PAGAMENTO (SE SEGUE A MESMA LÓGICA ANTERIOR)
        if (i.isStringSelectMenu() && i.customId.startsWith('compra_')) {
            const msgId = i.customId.split('_').pop();
            const prod = db.paineis[msgId].produtos[parseInt(i.values[0])];
            
            const canal = await i.guild.channels.create({
                name: `🛒-${i.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoVend.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: cargoDono.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder().setTitle("Revisão").setDescription(`**Produto:** ${prod.nome}\n**Valor:** ${prod.valor}`).setColor("#5865F2");
            const btns = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pagar_agora').setLabel('Pagar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('fechar_t').setLabel('Fechar').setStyle(ButtonStyle.Danger)
            );

            // Guardamos temporariamente os dados do produto no canal ou via variável
            await canal.send({ content: `${i.user} | Chave PIX: \`${prod.pix}\``, embeds: [embed], components: [btns] });
            await i.update({ content: `✅ Ticket: ${canal}`, components: [] });
        }

        if (i.isButton() && i.customId === 'pagar_agora') {
            await i.reply({ content: "💠 Verifique a chave PIX enviada no topo do chat e anexe o comprovante.", ephemeral: true });
        }

        if (i.isButton() && i.customId === 'fechar_t') await i.channel.delete().catch(() => {});
    });

    await client.login(token);
    await registrarComandos(token, client.user.id);
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/ligar-bot', async (req, res) => {
    try { await iniciarBot(req.body.token); res.send({ msg: "OK" }); } catch (e) { res.send({ msg: "ERRO" }); }
});
app.listen(process.env.PORT || 3000, '0.0.0.0');
